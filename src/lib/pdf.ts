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
  receipt_no?: string | null; // optional — auto-generated if not supplied
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
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function paidDate(ts?: string | null) {
  if (!ts) return today();
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function makeReceiptNo(flatNumber: string, month: number, year: number) {
  const flatCode = flatNumber.replace(/\s+/g, "-");
  const mm = String(month).padStart(2, "0");
  return `R-${flatCode}-${year}${mm}`;
}

// ─── Rent Receipt PDF ─────────────────────────────────────────────────────────
// Layout: header → receipt meta → Bill To → Particulars (with plain-English
// breakdowns for each charge) → Totals → Payment Info → status stamp → footer.
// This mirrors the classic rent-receipt format while making every charge
// easy to understand at a glance.

export function exportReadingPdf(opts: {
  reading: ReadingPdf;
  flatNumber: string;
  tenantName: string;
  tenantMobile?: string;
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
  const ob        = Number(r.opening_balance);
  const due       = Number(r.total_due);
  const paid      = Number(r.amount_paid);
  const balance   = Math.max(0, due - paid);
  const advance   = Math.max(0, paid - due);
  const isPaid    = r.payment_status === "paid";
  const isPartial = r.payment_status === "partial";
  const method    = (r.payment_method || "UPI").toUpperCase();
  const receiptNo = r.receipt_no || makeReceiptNo(flatNumber, r.month, r.year);

  // Page: A5 portrait (148 × 210 mm) — standard rent-receipt size
  const W = 148, H = 210, M = 14;
  const doc = new jsPDF({ unit: "mm", format: [W, H] });
  let y = M;

  // ── low-level helpers ──────────────────────────────────────────────────
  const font = (size: number, bold = false, color = 0) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(color);
  };

  const centerText = (text: string, size: number, bold = false, color = 0) => {
    font(size, bold, color);
    doc.text(text, W / 2, y, { align: "center" });
    y += size * 0.42 + 1.2;
  };

  const hline = (thickness = 0.3, color = 0, gapAfter = 3) => {
    doc.setDrawColor(color);
    doc.setLineWidth(thickness);
    doc.line(M, y, W - M, y);
    doc.setDrawColor(0);
    y += gapAfter;
  };

  // left-aligned "Label : Value" line — used for receipt meta & bill-to block
  const fieldLine = (label: string, value: string, size = 9) => {
    font(size, true, 60);
    const labelText = `${label} :`;
    doc.text(labelText, M, y);
    const labelWidth = doc.getTextWidth(labelText);
    font(size, false, 0);
    doc.text(` ${value}`, M + labelWidth, y);
    y += size * 0.42 + 1.6;
  };

  // particulars row: charge name (left) + amount (right)
  const chargeRow = (
    label: string, amount: string,
    rowOpts?: { bold?: boolean; size?: number; color?: number }
  ) => {
    const { bold = false, size = 9, color = 0 } = rowOpts || {};
    font(size, bold, color);
    doc.text(label, M, y);
    doc.text(amount, W - M, y, { align: "right" });
    y += size * 0.42 + 1.4;
  };

  // small gray note indented under a charge row — plain-English explanation
  const subNote = (text: string) => {
    font(7.3, false, 110);
    doc.text(text, M + 2, y);
    y += 3.6;
  };

  const sectionHeader = (title: string) => {
    y += 1;
    doc.setFillColor(245, 245, 245);
    doc.rect(M - 2, y - 4, W - 2 * (M - 2), 6.5, "F");
    font(8.5, true, 50);
    doc.text(title.toUpperCase(), M, y);
    y += 4.5;
  };

  // ── HEADER ────────────────────────────────────────────────────────────
  centerText(ownerName || "TildaRoom Properties", 15, true);
  if (ownerMobile) {
    centerText(`Mob: ${ownerMobile}`, 8.5, false, 100);
  }
  y += 1;
  hline(0.6, 0, 4);

  centerText("RENT RECEIPT", 13, true);
  y += 1;

  // ── RECEIPT META ──────────────────────────────────────────────────────
  fieldLine("Receipt No", receiptNo);
  fieldLine("Date", today());
  fieldLine("Period", monthLabel(r.month, r.year));
  y += 1;
  hline(0.2, 200, 3);

  // ── BILL TO ───────────────────────────────────────────────────────────
  sectionHeader("Bill To");
  fieldLine("Tenant", tenantName || "—");
  fieldLine("Flat", `Flat ${flatNumber}`);
  if (tenantMobile) {
    const mob = tenantMobile.replace(/\D/g, "");
    fieldLine("Mobile", mob.length === 10 ? mob.replace(/(\d{5})(\d{5})/, "$1 $2") : mob);
  }
  y += 1;

  // ── PARTICULARS ───────────────────────────────────────────────────────
  sectionHeader("Particulars");

  font(8.3, true, 70);
  doc.text("Particulars", M, y);
  doc.text("Amount", W - M, y, { align: "right" });
  y += 3;
  doc.setLineWidth(0.15); doc.setDrawColor(180);
  doc.line(M, y, W - M, y);
  doc.setDrawColor(0); y += 3;

  if (r.curr_reading != null) {
    chargeRow("Electricity Charges", rs(elec));
    subNote(`Prev: ${Number(r.prev_reading).toFixed(0)}   Curr: ${Number(r.curr_reading).toFixed(0)}   Units: ${units.toFixed(0)}`);
    subNote(`${units.toFixed(0)} units x Rs. ${rate.toFixed(2)}/unit = ${rs(elec)}`);
    y += 0.5;
  }

  chargeRow("Rent", rs(rent));
  subNote("Monthly rent for the flat");

  if (maint > 0) {
    chargeRow("Maintenance", rs(maint));
    subNote("Common area upkeep & building maintenance");
  }

  if (other > 0) {
    chargeRow("Other Charges", rs(other));
    subNote("Miscellaneous charges for this period");
  }

  // ob < 0 → tenant still owed last month (adds to this bill)
  // ob > 0 → tenant overpaid last month (deducts from this bill)
  if (ob !== 0) {
    const isOwed = ob < 0;
    chargeRow(
      isOwed ? "Last Month Balance (due)" : "Last Month Balance (advance)",
      isOwed ? `+ ${rs(Math.abs(ob))}` : `- ${rs(ob)}`,
      { color: isOwed ? 180 : 22 }
    );
    subNote(isOwed ? "Carried forward, unpaid from last month" : "Carried forward, extra paid last month");
  }

  y += 1;
  hline(0.4, 0, 2);

  // page-break safety net if Particulars ran long
  if (y > H - 70) {
    doc.addPage([W, H]);
    y = M;
  }

  // ── TOTALS (highlighted box) ─────────────────────────────────────────
  const boxTop = y - 1.5;
  chargeRow("Total Due", rs(due), { bold: true, size: 9.5 });
  chargeRow("Amount Paid", rs(paid), { bold: true, size: 9.5 });

  if (balance > 0) {
    chargeRow("Balance Due", rs(balance), { bold: true, size: 9.5, color: 180 });
    subNote("Pending amount - carries forward to next month if unpaid");
  } else if (advance > 0) {
    chargeRow("Advance Carried Forward", rs(advance), { bold: true, size: 9.5, color: 22 });
    subNote("Extra amount paid - adjusted against next month's bill");
  } else {
    chargeRow("Balance", rs(0), { bold: true, size: 9.5, color: 22 });
    subNote("Fully paid - no balance due");
  }

  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  doc.roundedRect(M - 2, boxTop, W - 2 * (M - 2), y - boxTop + 1, 1, 1, "S");
  doc.setDrawColor(0);
  y += 4;

  // ── PAYMENT INFO ──────────────────────────────────────────────────────
  fieldLine("Payment Via", method);
  fieldLine("Paid On", paidDate(r.payment_timestamp));
  y += 2;

  // ── STATUS STAMP ──────────────────────────────────────────────────────
  const stampWord = statusLabel(r.payment_status).toUpperCase();
  const stampText = `[ ${stampWord} ]`;
  const stColor: [number, number, number] = isPaid
    ? [22, 163, 74]
    : isPartial
      ? [234, 88, 12]
      : [220, 38, 38];

  font(11, true);
  const stampW = doc.getTextWidth(stampText) + 10;
  const stampX = W / 2 - stampW / 2;
  doc.setDrawColor(stColor[0], stColor[1], stColor[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(stampX, y - 6, stampW, 9, 1.5, 1.5, "S");
  doc.setTextColor(stColor[0], stColor[1], stColor[2]);
  doc.text(stampText, W / 2, y, { align: "center" });
  doc.setTextColor(0);
  doc.setDrawColor(0);
  y += 9;

  // ── FOOTER ────────────────────────────────────────────────────────────
  centerText(
    isPaid
      ? "Thank you for your payment!"
      : isPartial
        ? "Thank you — balance due next cycle."
        : "Payment pending — please clear at the earliest.",
    9, true
  );
  centerText("This is a computer-generated receipt.", 7, false, 130);

  const flatPart = `Flat${flatNumber.replace(/\s+/g, "")}`;
  const periodPart = monthLabel(r.month, r.year).replace(" ", "_");
  doc.save(`Receipt_${flatPart}_${periodPart}.pdf`);
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
