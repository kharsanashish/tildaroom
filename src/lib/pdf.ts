import jsPDF from "jspdf";
import { monthLabel, statusLabel, type PaymentStatus } from "./billing";

export interface ReadingPdf {
  month: number;
  year: number;
  prev_reading: number;
  curr_reading: number | null;
  units: number;
  rate_per_unit: number;
  electricity_bill: number;
  rent: number;
  maintenance?: number;
  other_charges: number;
  opening_balance: number;
  total_due: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  payment_method?: string | null;
  payment_timestamp?: string | null;
}

function rs(n: number) {
  return `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
}

function today() {
  return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function paidDate(ts: string | null | undefined) {
  if (!ts) return today();
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function exportReadingPdf(opts: {
  reading: ReadingPdf;
  flatNumber: string;
  tenantName: string;
  tenantMobile?: string;
  ownerName?: string;
  ownerMobile?: string;
}) {
  const { reading: r, flatNumber, tenantName, tenantMobile, ownerName, ownerMobile } = opts;

  // Dynamic height — calculate rows first
  const hasElec = r.curr_reading !== null;
  const hasMaint = Number(r.maintenance ?? 0) > 0;
  const hasOther = Number(r.other_charges) > 0;
  const hasBalance = Number(r.opening_balance) !== 0;
  const itemRows = 2 + (hasMaint ? 1 : 0) + (hasOther ? 1 : 0) + (hasBalance ? 1 : 0);
  const elecRows = hasElec ? 3 : 0; // units block lines
  const estimatedH = 80 + (elecRows * 4.5) + (itemRows * 5.5) + 60;

  const doc = new jsPDF({ unit: "mm", format: [80, estimatedH] });
  const W = 80;
  let y = 8;

  /* ── helpers ── */
  const center = (text: string, size: number, bold = false, color = 0) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(color);
    doc.text(text, W / 2, y, { align: "center" });
    y += size * 0.42;
  };

  const solidLine = () => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([], 0);
    doc.line(4, y, W - 4, y);
    y += 3;
  };

  const dashedLine = () => {
    doc.setDrawColor(120);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(4, y, W - 4, y);
    doc.setLineDashPattern([], 0);
    y += 3;
  };

  const row = (label: string, value: string, bold = false, labelIndent = 5) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(0);
    doc.text(label, labelIndent, y);
    doc.text(value, W - 5, y, { align: "right" });
    y += 5;
  };

  const subrow = (text: string) => {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(text, 9, y);
    y += 4;
  };

  const field = (label: string, value: string) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60);
    doc.text(label, 5, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(value, 5 + doc.getTextWidth(label) + 1, y);
    y += 4.5;
  };

  /* ── HEADER ── */
  y += 1;
  center(ownerName?.toUpperCase() || "RENT MANAGEMENT", 13, true);
  y += 1;
  if (ownerMobile) {
    center(`Mob: ${ownerMobile}`, 7.5, false, 80);
    y += 1;
  }
  solidLine();

  center("RENT RECEIPT", 10, true);
  y += 1;
  solidLine();

  /* ── RECEIPT META ── */
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  field("Receipt No : ", `R-${flatNumber}-${r.year}${String(r.month).padStart(2, "0")}`);
  field("Date       : ", paidDate(r.payment_timestamp));
  field("Period     : ", monthLabel(r.month, r.year));
  y += 1;
  dashedLine();

  /* ── BILL TO ── */
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("BILL TO", 5, y);
  y += 4.5;
  field("Tenant : ", tenantName);
  field("Flat   : ", `Flat ${flatNumber}`);
  if (tenantMobile) field("Mobile : ", tenantMobile);
  y += 1;
  solidLine();

  /* ── ITEMS HEADER ── */
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("PARTICULARS", 5, y);
  doc.text("AMOUNT", W - 5, y, { align: "right" });
  y += 2;
  dashedLine();

  /* ── ELECTRICITY ── */
  if (hasElec) {
    row("Electricity Charges", rs(Number(r.electricity_bill)));
    subrow(`Prev: ${r.prev_reading}  Curr: ${r.curr_reading}  Units: ${Number(r.units).toFixed(0)}`);
    subrow(`Rate: ${rs(Number(r.rate_per_unit))}/unit`);
  } else {
    row("Electricity", rs(0));
  }

  row("Rent", rs(Number(r.rent)));

  if (hasMaint) row("Maintenance", rs(Number(r.maintenance)));
  if (hasOther) row("Other Charges", rs(Number(r.other_charges)));

  if (hasBalance) {
    const isAdv = Number(r.opening_balance) > 0;
    row(
      isAdv ? "Prev. Advance (deduct)" : "Prev. Arrears (add)",
      `${isAdv ? "- " : "+ "}${rs(Math.abs(Number(r.opening_balance)))}`
    );
  }

  y += 1;
  solidLine();

  /* ── TOTALS ── */
  row("Total Due", rs(Number(r.total_due)), true);
  row("Amount Paid", rs(Number(r.amount_paid)));
  const bal = Number(r.total_due) - Number(r.amount_paid);
  row("Balance", rs(bal), true);
  y += 1;
  solidLine();

  /* ── PAYMENT INFO ── */
  if (r.payment_method || r.payment_timestamp) {
    if (r.payment_method) {
      field("Payment Via : ", r.payment_method.toUpperCase());
    }
    if (r.payment_timestamp) {
      field("Paid On     : ", paidDate(r.payment_timestamp));
    }
    y += 1;
    dashedLine();
  }

  /* ── STATUS STAMP ── */
  const status = statusLabel(r.payment_status).toUpperCase();
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  const isPaid = r.payment_status === "paid";
  doc.setTextColor(isPaid ? 30 : 180, isPaid ? 140 : 30, isPaid ? 50 : 30);
  doc.text(`[ ${status} ]`, W / 2, y, { align: "center" });
  y += 7;
  doc.setTextColor(0);

  solidLine();

  /* ── FOOTER ── */
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(80);
  doc.text("Thank you for your payment!", W / 2, y, { align: "center" });
  y += 4;
  doc.text("This is a computer-generated receipt.", W / 2, y, { align: "center" });

  doc.save(`Receipt_Flat${flatNumber}_${monthLabel(r.month, r.year).replace(" ", "_")}.pdf`);
}
