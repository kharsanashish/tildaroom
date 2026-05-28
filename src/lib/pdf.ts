import jsPDF from "jspdf";
import { monthLabel, statusLabel, type PaymentStatus } from "./billing";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReadingPdf {
  month: number; year: number;
  prev_reading: number; curr_reading: number | null;
  units: number; rate_per_unit: number; electricity_bill: number;
  rent: number; maintenance?: number; other_charges: number;
  opening_balance: number; total_due: number; amount_paid: number;
  payment_status: PaymentStatus;
  payment_method?: string | null;
  payment_timestamp?: string | null;
}

export interface FlatSummaryRow {
  flatNumber: string; tenantName: string;
  totalDue: number; amountPaid: number;
  paymentStatus: PaymentStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rs(n: number) {
  return `Rs.${Math.round(n).toLocaleString("en-IN")}`;
}

function today() {
  return new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function paidDate(ts: string | null | undefined) {
  if (!ts) return today();
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ─── Thermal Receipt Builder ───────────────────────────────────────────────────
// 80 mm wide receipt — same look as Indian POS/thermal printer bills

class ThermalReceipt {
  private doc: jsPDF;
  private y = 0;
  private readonly W = 80;   // page width in mm
  private readonly M = 4;    // side margin
  private readonly C = 40;   // center x

  constructor(pageHeight: number) {
    this.doc = new jsPDF({ unit: "mm", format: [this.W, pageHeight] });
    this.y = 5;
  }

  // ── primitives ──────────────────────────────────────────────────────────────

  private font(size: number, style: "normal" | "bold" = "normal", color = 0) {
    this.doc.setFontSize(size);
    this.doc.setFont("courier", style);
    this.doc.setTextColor(color);
  }

  center(text: string, size: number, bold = false, gap = 1) {
    this.font(size, bold ? "bold" : "normal");
    this.doc.text(text, this.C, this.y, { align: "center" });
    this.y += size * 0.36 + gap;
  }

  left(text: string, size: number, bold = false, x?: number) {
    this.font(size, bold ? "bold" : "normal");
    this.doc.text(text, x ?? this.M, this.y);
    this.y += size * 0.36 + 0.8;
  }

  // label on left, value on right — classic receipt row
  row(label: string, value: string, size = 8, bold = false, valueColor = 0) {
    this.font(size, bold ? "bold" : "normal");
    this.doc.setTextColor(0);
    this.doc.text(label, this.M, this.y);
    this.font(size, bold ? "bold" : "normal", valueColor);
    this.doc.text(value, this.W - this.M, this.y, { align: "right" });
    this.doc.setTextColor(0);
    this.y += size * 0.36 + 0.8;
  }

  dashLine(gap = 2) {
    this.y += gap * 0.3;
    this.font(6.5, "normal");
    const dashes = "-".repeat(38);
    this.doc.text(dashes, this.C, this.y, { align: "center" });
    this.y += 2.5;
  }

  solidLine(gap = 1) {
    this.y += gap * 0.3;
    this.doc.setDrawColor(0);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.M, this.y, this.W - this.M, this.y);
    this.y += 2;
  }

  doubleLine() {
    this.doc.setDrawColor(0);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.M, this.y, this.W - this.M, this.y);
    this.y += 1;
    this.doc.setLineWidth(0.2);
    this.doc.line(this.M, this.y, this.W - this.M, this.y);
    this.y += 2.5;
  }

  spacer(h = 2) { this.y += h; }

  get currentY() { return this.y; }

  save(filename: string) { this.doc.save(filename); }
}

// ─── Per-reading Receipt ───────────────────────────────────────────────────────

export function exportReadingPdf(opts: {
  reading: ReadingPdf;
  flatNumber: string;
  tenantName: string;
  tenantMobile?: string;   // WhatsApp / contact number
  ownerName?: string;
  ownerMobile?: string;
}) {
  const { reading: r, flatNumber, tenantName, tenantMobile, ownerName, ownerMobile } = opts;

  const units     = Number(r.units);
  const rate      = Number(r.rate_per_unit);
  const elec      = Number(r.electricity_bill);
  const rent      = Number(r.rent);
  const maint     = Number(r.maintenance ?? 0);
  const other     = Number(r.other_charges);
  const ob        = Number(r.opening_balance);   // negative = prev balance due, positive = advance
  const due       = Number(r.total_due);
  const paid      = Number(r.amount_paid);
  const balance   = Math.max(0, due - paid);
  const isPaid    = r.payment_status === "paid";
  const isPartial = r.payment_status === "partial";
  const payType   = isPaid ? "FULL PAYMENT" : isPartial ? "PARTIAL PAYMENT" : statusLabel(r.payment_status).toUpperCase();
  const method    = (r.payment_method || "UPI").toUpperCase();

  const receipt = new ThermalReceipt(240);

  // ── HEADER: use ownerName from settings as property name ──────────────────
  receipt.spacer(1);
  receipt.center((ownerName || "TildaRoom Properties").toUpperCase(), 12, true);
  if (ownerMobile) receipt.center(`Tel: ${ownerMobile}`, 7.5);
  receipt.doubleLine();

  receipt.center("RENT RECEIPT", 9, true);
  receipt.spacer(1);

  // ── META ──────────────────────────────────────────────────────────────────
  receipt.row("Date", paidDate(r.payment_timestamp));
  receipt.row("Period", monthLabel(r.month, r.year));
  receipt.dashLine();

  // ── TENANT DETAILS ────────────────────────────────────────────────────────
  receipt.row("Flat", `Flat ${flatNumber}`, 8, true);
  receipt.row("Tenant", tenantName || "—");
  if (tenantMobile) receipt.row("Mobile", tenantMobile.replace(/\D/g, "").replace(/^(\d{2})(\d{4})(\d{4})$/, "$1-$2-$3"));
  receipt.dashLine();

  // ── METER READING (current first, then previous) ──────────────────────────
  receipt.center("METER READING", 7.5, true);
  receipt.spacer(0.5);
  if (r.curr_reading != null) {
    receipt.row("Current Reading", `${Number(r.curr_reading).toFixed(0)} units`);
  }
  receipt.row("Previous Reading", `${Number(r.prev_reading).toFixed(0)} units`);
  if (r.curr_reading != null) {
    receipt.row("Units Consumed", `${units.toFixed(0)} units`);
    receipt.row("Rate / Unit", `Rs.${rate.toFixed(2)}`);
  }
  receipt.dashLine();

  // ── BILL DETAILS ──────────────────────────────────────────────────────────
  receipt.center("BILL DETAILS", 7.5, true);
  receipt.spacer(0.5);
  receipt.row("Rent", rs(rent));
  if (maint > 0) receipt.row("Maintenance", rs(maint));
  if (other > 0) receipt.row("Other Charges", rs(other));
  if (r.curr_reading != null) {
    receipt.row(`Electricity (${units.toFixed(0)}u)`, rs(elec));
  }
  // Previous balance — negative ob means tenant owed from last month (add to bill)
  // Positive ob means tenant paid advance (deduct from bill)
  if (ob < 0) {
    receipt.row("Prev Month Balance", `+${rs(Math.abs(ob))}`, 8, false, 160);
  } else if (ob > 0) {
    receipt.row("Prev Month Advance", `-${rs(ob)}`, 8, false, 80);
  }
  receipt.solidLine();

  // ── TOTALS ────────────────────────────────────────────────────────────────
  receipt.row("TOTAL DUE", rs(due), 9, true);
  receipt.row("AMOUNT PAID", rs(paid), 9, true, paid >= due ? 30 : 160);
  if (isPartial && balance > 0) {
    receipt.row("BALANCE REMAINING", rs(balance), 9, true, 160);
  }
  receipt.doubleLine();

  // ── PAYMENT TYPE + METHOD ─────────────────────────────────────────────────
  receipt.row("Payment Type", payType, 8, true, isPaid ? 30 : isPartial ? 100 : 160);
  receipt.row("Payment Mode", method);
  receipt.row(
    "Status",
    isPaid ? "PAID  [✓]" : isPartial ? "PARTIAL [~]" : "PENDING",
    8, true,
    isPaid ? 30 : isPartial ? 100 : 160,
  );
  receipt.dashLine();

  // ── FOOTER ────────────────────────────────────────────────────────────────
  receipt.spacer(1);
  receipt.center("Thank you for the payment!", 7.5);
  receipt.center("Please keep this receipt.", 7);
  receipt.spacer(1);
  receipt.center(`Generated: ${today()}`, 6.5);
  receipt.spacer(3);

  receipt.save(`Receipt_Flat${flatNumber}_${monthLabel(r.month, r.year).replace(" ", "_")}.pdf`);
}

// ─── Monthly Summary PDF (A4, table layout) ────────────────────────────────────

export function exportMonthlySummaryPdf(opts: {
  month: number; year: number;
  ownerName?: string; ownerMobile?: string;
  rows: FlatSummaryRow[];
}) {
  const { month, year, ownerName, ownerMobile, rows } = opts;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  let y = 10;

  const font = (size: number, bold = false, color = 0) => {
    doc.setFontSize(size);
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setTextColor(color);
  };

  const ctr = (text: string, size: number, bold = false) => {
    font(size, bold);
    doc.text(text, W / 2, y, { align: "center" });
    y += size * 0.38 + 1;
  };

  const dashes = () => {
    font(7, false, 150);
    doc.text("-".repeat(100), W / 2, y, { align: "center" });
    y += 3;
  };

  // Header
  y += 2;
  ctr(ownerName?.toUpperCase() || "TILDA PROPERTIES", 16, true);
  if (ownerMobile) ctr(`Tel: ${ownerMobile}`, 9, false);
  y += 1;
  doc.setDrawColor(0); doc.setLineWidth(0.5);
  doc.line(10, y, W - 10, y); y += 1;
  doc.setLineWidth(0.2);
  doc.line(10, y, W - 10, y); y += 4;

  ctr("MONTHLY COLLECTION SUMMARY", 12, true);
  ctr(monthLabel(month, year), 10);
  ctr(`Date: ${today()}`, 8.5);
  y += 2;
  dashes();

  // Column positions
  const col = { flat: 12, name: 40, due: 112, paid: 142, bal: 172, status: 190 };

  // Table header
  font(8, true);
  doc.setTextColor(0);
  doc.text("Flat",       col.flat,   y);
  doc.text("Tenant",     col.name,   y);
  doc.text("Total Due",  col.due,  y, { align: "right" });
  doc.text("Paid",       col.paid, y, { align: "right" });
  doc.text("Balance",    col.bal,  y, { align: "right" });
  doc.text("Status",     col.status, y);
  y += 2;
  doc.setLineWidth(0.4); doc.line(10, y, W - 10, y); y += 3;

  // Rows
  let totalDue = 0, totalPaid = 0;
  for (const r of rows) {
    const bal = Math.max(0, r.totalDue - r.amountPaid);
    totalDue  += r.totalDue;
    totalPaid += r.amountPaid;

    font(8, false, 0);
    doc.text(r.flatNumber, col.flat, y);
    doc.text(r.tenantName || "—", col.name, y);

    font(8, false, 0);
    doc.text(rs(r.totalDue), col.due, y, { align: "right" });
    doc.text(rs(r.amountPaid), col.paid, y, { align: "right" });

    if (bal > 0) { font(8, false, 180); }
    doc.text(rs(bal), col.bal, y, { align: "right" });

    const st = r.paymentStatus;
    const stColor = st === "paid" ? 30 : st === "partial" ? 100 : 160;
    font(7.5, true, stColor);
    doc.text(statusLabel(r.paymentStatus).toUpperCase(), col.status, y);

    y += 7;
  }

  // Totals row
  doc.setLineWidth(0.4); doc.line(10, y, W - 10, y); y += 3;
  font(9, true, 0);
  doc.text("TOTALS", col.flat, y);
  doc.text(rs(totalDue), col.due, y, { align: "right" });
  doc.text(rs(totalPaid), col.paid, y, { align: "right" });
  const totalBal = Math.max(0, totalDue - totalPaid);
  font(9, true, totalBal > 0 ? 160 : 30);
  doc.text(rs(totalBal), col.bal, y, { align: "right" });
  y += 4;

  doc.setLineWidth(0.5); doc.line(10, y, W - 10, y); y += 1;
  doc.setLineWidth(0.2); doc.line(10, y, W - 10, y); y += 6;

  // Footer
  font(7.5, false, 120);
  doc.text(`Generated on ${today()} | TildaRoom`, W / 2, y, { align: "center" });

  doc.save(`Summary_${monthLabel(month, year).replace(" ", "_")}.pdf`);
}
