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
  return `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
}

function today() {
  return new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "numeric", year: "numeric",
  });
}

function paidDate(ts?: string | null) {
  if (!ts) return today();
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit", month: "numeric", year: "numeric",
  });
}

// ─── Invoice PDF ──────────────────────────────────────────────────────────────
// Matches the clean invoice format: header → meta → electricity → particulars → totals

export function exportReadingPdf(opts: {
  reading: ReadingPdf;
  flatNumber: string;
  tenantName: string;
  tenantMobile?: string;
  ownerName?: string;
  ownerMobile?: string;
}) {
  const { reading: r, flatNumber, tenantName, tenantMobile, ownerName, ownerMobile } = opts;

  const units    = Number(r.units);
  const rate     = Number(r.rate_per_unit);
  const elec     = Number(r.electricity_bill);
  const rent     = Number(r.rent);
  const maint    = Number(r.maintenance ?? 0);
  const other    = Number(r.other_charges);
  const ob       = Number(r.opening_balance);
  const due      = Number(r.total_due);
  const paid     = Number(r.amount_paid);
  const balance  = Math.max(0, due - paid);
  const isPaid   = r.payment_status === "paid";
  const isPartial = r.payment_status === "partial";
  const method   = (r.payment_method || "UPI").toUpperCase();

  // Page: A5-ish portrait (148 × 210 mm)
  const W = 148, H = 210, M = 12;
  const doc = new jsPDF({ unit: "mm", format: [W, H] });
  let y = M;

  // helpers
  const font = (size: number, bold = false, color = 0) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(color);
  };

  const hline = (thickness = 0.3) => {
    doc.setDrawColor(0);
    doc.setLineWidth(thickness);
    doc.line(M, y, W - M, y);
    y += 3;
  };

  const row2 = (
    left: string, right: string,
    size = 8.5, bold = false,
    rightColor = 0
  ) => {
    font(size, bold);
    doc.setTextColor(0);
    doc.text(left, M, y);
    doc.setTextColor(rightColor);
    doc.text(right, W - M, y, { align: "right" });
    doc.setTextColor(0);
    y += size * 0.42 + 1;
  };

  const label2 = (left: string, right: string, size = 8.5) => {
    font(size, false, 80);
    doc.text(left, M, y);
    font(size, false, 0);
    doc.text(right, W - M, y, { align: "right" });
    y += size * 0.42 + 0.8;
  };

  const sectionTitle = (title: string) => {
    y += 1;
    font(8, true, 0);
    doc.text(title, M, y);
    y += 4;
    doc.setLineWidth(0.2);
    doc.setDrawColor(160);
    doc.line(M, y, W - M, y);
    doc.setDrawColor(0);
    y += 2.5;
  };

  // ── OWNER NAME HEADER ────────────────────────────────────────────────────
  font(14, true);
  doc.text(ownerName || "TildaRoom Properties", M, y);
  y += 7;
  if (ownerMobile) {
    font(7.5, false, 100);
    doc.text(`Tel: ${ownerMobile}`, M, y);
    y += 4;
  }
  hline(0.5);

  // ── TENANT & PERIOD DETAILS ───────────────────────────────────────────────
  y += 1;
  label2("Room/Flat", `Flat ${flatNumber}`, 8.5);
  label2("Tenant", tenantName || "—");
  if (tenantMobile) {
    const mob = tenantMobile.replace(/\D/g, "");
    label2("Mobile", mob.length === 10 ? mob.replace(/(\d{5})(\d{5})/, "$1 $2") : mob);
  }
  label2("Period", monthLabel(r.month, r.year));
  label2("Date", paidDate(r.payment_timestamp));

  // Status with color
  const stColor = isPaid ? [22, 163, 74] : isPartial ? [234, 88, 12] : [220, 38, 38];
  font(8.5, true);
  doc.text("Status", M, y);
  doc.setTextColor(stColor[0], stColor[1], stColor[2]);
  doc.text(statusLabel(r.payment_status).toUpperCase(), W - M, y, { align: "right" });
  doc.setTextColor(0);
  y += 5;

  // ── ELECTRICITY METRICS ───────────────────────────────────────────────────
  if (r.curr_reading != null) {
    sectionTitle("Electricity Metrics");
    label2("Current Reading", `${Number(r.curr_reading).toFixed(0)}`);
    label2("Previous Reading", `${Number(r.prev_reading).toFixed(0)}`);
    label2("Units Consumed", `${units.toFixed(0)} units`);
    label2("Rate per Unit", `Rs. ${rate.toFixed(2)}/unit`);
    y += 1;
  }

  // ── PARTICULARS TABLE ─────────────────────────────────────────────────────
  sectionTitle("Particulars");

  // Table header
  font(8, true);
  doc.text("Particulars", M, y);
  doc.text("Amount", W - M, y, { align: "right" });
  y += 3.5;
  doc.setLineWidth(0.15); doc.setDrawColor(180);
  doc.line(M, y, W - M, y);
  doc.setDrawColor(0); y += 2.5;

  // Rows
  row2("Rent Charges", rs(rent));
  if (r.curr_reading != null) row2("Electricity Bill", rs(elec));
  if (maint > 0) row2("Maintenance", rs(maint));
  if (other > 0) row2("Other Charges", rs(other));
  // Last month balance — always show when non-zero
  // ob < 0 means tenant still owed last month → adds to this bill (shown in red as +amount)
  // ob > 0 means tenant overpaid last month → deducts from this bill (shown in green as -amount)
  if (ob !== 0) {
    const isOwed = ob < 0;
    row2(
      isOwed ? "Last Month Balance (due)" : "Last Month Balance (advance)",
      isOwed ? `+ ${rs(Math.abs(ob))}` : `- ${rs(ob)}`,
      8.5, false,
      isOwed ? 180 : 22,
    );
  }

  y += 1;
  hline(0.4);

  // ── TOTALS ────────────────────────────────────────────────────────────────
  y += 1;
  row2("Total Amount Due", rs(due), 9, true);
  row2("Total Amount Paid", rs(paid), 9, true, isPaid ? 22 * 0 + 30 : 30);
  if (isPartial && balance > 0) {
    row2("Remaining Balance", rs(balance), 9, true, 180);
  }
  y += 2;
  hline(0.3);

  // ── FOOTER ────────────────────────────────────────────────────────────────
  y += 1;
  font(8, false, 80);
  doc.text(`Paid Via: ${method}`, M, y); y += 5;
  font(8.5, true, 0);
  doc.text("Thank you for payment!", M, y); y += 5;
  font(7, false, 160);
  doc.text(`Generated: ${today()}`, M, y);

  doc.save(`Invoice_${flatNumber.replace(/\s/g, "-")}_${monthLabel(r.month, r.year).replace(" ", "_")}.pdf`);
}

// ─── Monthly Summary PDF (A4 landscape table) ──────────────────────────────

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
    doc.setFontSize(size); doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setTextColor(color);
  };
  const ctr = (text: string, size: number, bold = false) => {
    font(size, bold); doc.text(text, W / 2, y, { align: "center" }); y += size * 0.38 + 1;
  };

  y += 2;
  ctr(ownerName || "TildaRoom Properties", 16, true);
  if (ownerMobile) ctr(`Tel: ${ownerMobile}`, 9);
  y += 1;
  doc.setLineWidth(0.5); doc.line(10, y, W - 10, y); y += 1;
  doc.setLineWidth(0.2); doc.line(10, y, W - 10, y); y += 4;
  ctr("MONTHLY COLLECTION SUMMARY", 12, true);
  ctr(monthLabel(month, year), 10);
  ctr(`Date: ${today()}`, 8.5);
  y += 2;

  const col = { flat: 12, name: 40, due: 112, paid: 142, bal: 172, status: 190 };

  font(8, true);
  doc.text("Flat", col.flat, y); doc.text("Tenant", col.name, y);
  doc.text("Total Due", col.due, y, { align: "right" });
  doc.text("Paid", col.paid, y, { align: "right" });
  doc.text("Balance", col.bal, y, { align: "right" });
  doc.text("Status", col.status, y); y += 2;
  doc.setLineWidth(0.4); doc.line(10, y, W - 10, y); y += 3;

  let totalDue = 0, totalPaid = 0;
  for (const r of rows) {
    const bal = Math.max(0, r.totalDue - r.amountPaid);
    totalDue += r.totalDue; totalPaid += r.amountPaid;
    font(8); doc.text(r.flatNumber, col.flat, y); doc.text(r.tenantName || "—", col.name, y);
    doc.text(rs(r.totalDue), col.due, y, { align: "right" });
    doc.text(rs(r.amountPaid), col.paid, y, { align: "right" });
    if (bal > 0) font(8, false, 180);
    doc.text(rs(bal), col.bal, y, { align: "right" });
    const sc = r.paymentStatus === "paid" ? 30 : r.paymentStatus === "partial" ? 100 : 160;
    font(7.5, true, sc);
    doc.text(statusLabel(r.paymentStatus).toUpperCase(), col.status, y);
    y += 7;
  }

  doc.setLineWidth(0.4); doc.line(10, y, W - 10, y); y += 3;
  font(9, true, 0);
  doc.text("TOTALS", col.flat, y);
  doc.text(rs(totalDue), col.due, y, { align: "right" });
  doc.text(rs(totalPaid), col.paid, y, { align: "right" });
  const tb = Math.max(0, totalDue - totalPaid);
  font(9, true, tb > 0 ? 160 : 30);
  doc.text(rs(tb), col.bal, y, { align: "right" }); y += 5;
  doc.setLineWidth(0.5); doc.line(10, y, W - 10, y); y += 1;
  doc.setLineWidth(0.2); doc.line(10, y, W - 10, y); y += 6;
  font(7.5, false, 120);
  doc.text(`Generated: ${today()} | TildaRoom`, W / 2, y, { align: "center" });

  doc.save(`Summary_${monthLabel(month, year).replace(" ", "_")}.pdf`);
}
