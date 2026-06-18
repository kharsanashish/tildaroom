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

// ─── Rent Receipt PDF — Thermal Roll Style ────────────────────────────────────
// Mimics a classic POS / thermal-printer receipt: narrow continuous roll,
// monospace font, plain dashed dividers, no color (thermal printers are
// monochrome). Both documents in this file (the per-tenant receipt and the
// monthly summary) share the same grid system so they look like they came
// off the same till roll.

const COLS = 32;       // character columns across the roll (~80mm paper)
const FS = 9;           // single fixed font size used for the whole grid —
                        // keeping one size guarantees every column lines up
const NOTE_FS = 7.5;    // smaller, safe to shrink (never overflows the roll)
const LINE = 3.6;       // mm advance per text line at FS
const NOTE_LINE = 3.0;  // mm advance per note line
const ITEM_W = 16, QTY_W = 6, AMT_W = COLS - ITEM_W - QTY_W; // 16 / 6 / 10

function clip(text: string, max: number) {
  return text.length > max ? text.slice(0, max) : text;
}

function rsT(n: number) {
  return `Rs ${n.toFixed(2)}`;
}

// Drawing helpers bound to one jsPDF instance + a running y cursor.
function makeThermalHelpers(doc: jsPDF, M: number) {
  let y = M;

  const setFont = (bold: boolean, size = FS) => {
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(size);
  };

  const printLine = (text: string, bold = false, size = FS, step = LINE) => {
    setFont(bold, size);
    doc.text(clip(text, COLS), M, y);
    y += step;
  };

  const note = (text: string) => {
    const maxLen = COLS - 2;
    const words = text.split(" ");
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > maxLen) {
        printLine("  " + line.trim(), false, NOTE_FS, NOTE_LINE);
        line = w;
      } else {
        line += " " + w;
      }
    }
    if (line.trim()) printLine("  " + line.trim(), false, NOTE_FS, NOTE_LINE);
  };

  const blank = () => { y += LINE * 0.55; };

  const dashes = () => printLine("-".repeat(COLS));

  const center = (text: string, bold = false) => {
    const t = clip(text, COLS);
    const pad = Math.max(0, Math.floor((COLS - t.length) / 2));
    printLine(" ".repeat(pad) + t, bold);
  };

  // two-column row spanning the full width: label .... amount
  const row2 = (label: string, amount: string, bold = false) => {
    let l = label, a = amount;
    if (l.length + a.length + 1 > COLS) l = l.slice(0, Math.max(0, COLS - a.length - 1));
    const gap = Math.max(1, COLS - l.length - a.length);
    printLine(l + " ".repeat(gap) + a, bold);
  };

  // three-column row: item | qty | amount
  const row3 = (item: string, qty: string, amt: string, bold = false) => {
    const a = clip(item, ITEM_W).padEnd(ITEM_W);
    const q = clip(qty, QTY_W).padStart(QTY_W);
    const m = clip(amt, AMT_W).padStart(AMT_W);
    printLine(a + q + m, bold);
  };

  return { printLine, note, blank, dashes, center, row2, row3, getY: () => y };
}

type ThermalHelpers = ReturnType<typeof makeThermalHelpers>;

// Builds a thermal-roll PDF: measures the exact height the content needs on
// a tall scratch page, then re-renders for real on a page sized to fit —
// no wasted blank roll at the bottom, like a real till-roll tear-off.
function buildThermalPdf(M: number, draw: (h: ThermalHelpers) => void): jsPDF {
  const probeFont = new jsPDF({ unit: "mm", format: "a4" });
  probeFont.setFont("courier", "normal");
  probeFont.setFontSize(FS);
  const charW = probeFont.getTextWidth("0"); // Courier is fixed-pitch: every char is this wide
  const W = charW * COLS + 2 * M;

  const measureDoc = new jsPDF({ unit: "mm", format: [W, 3000] });
  const measureHelpers = makeThermalHelpers(measureDoc, M);
  draw(measureHelpers);
  const H = measureHelpers.getY() + M;

  const doc = new jsPDF({ unit: "mm", format: [W, H] });
  draw(makeThermalHelpers(doc, M));
  return doc;
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

  const M = 5; // mm margin each side
  const doc = buildThermalPdf(M, (h) => {
    const { printLine, note, blank, dashes, center, row2, row3 } = h;

    // ── HEADER ────────────────────────────────────────────────────────
    center(ownerName || "TildaRoom Properties", true);
    if (ownerMobile) center(`Mob: ${ownerMobile}`);
    blank();
    center("RENT RECEIPT", true);
    blank();

    // ── META ─────────────────────────────────────────────────────────
    printLine(`Date: ${today()}`);
    blank();
    printLine(clip(tenantName || "-", COLS), true);
    printLine(`Flat: ${flatNumber}`);
    if (tenantMobile) {
      const mob = tenantMobile.replace(/\D/g, "");
      printLine(`Mobile: ${mob.length === 10 ? mob.replace(/(\d{5})(\d{5})/, "$1 $2") : mob}`);
    }
    blank();
    printLine(`Bill No: ${receiptNo}`);
    printLine(`Payment Mode: ${method}`);
    blank();
    printLine(`Period: ${monthLabel(r.month, r.year)}`);
    dashes();

    // ── ITEMS ────────────────────────────────────────────────────────
    row3("Item", "Qty", "Amt", true);
    dashes();

    let subTotal = 0;
    if (r.curr_reading != null) {
      row3("Electricity", units.toFixed(0), elec.toFixed(2));
      note(`Prev ${Number(r.prev_reading).toFixed(0)} Curr ${Number(r.curr_reading).toFixed(0)}`);
      note(`${units.toFixed(0)}u x Rs${rate.toFixed(2)} = Rs${elec.toFixed(2)}`);
      subTotal += elec;
    }

    row3("Rent", "1", rent.toFixed(2));
    note("Monthly rent for the flat");
    subTotal += rent;

    if (maint > 0) {
      row3("Maintenance", "1", maint.toFixed(2));
      note("Common area & building upkeep");
      subTotal += maint;
    }

    if (other > 0) {
      row3("Other Charges", "1", other.toFixed(2));
      note("Miscellaneous charges this period");
      subTotal += other;
    }

    dashes();
    row3("Sub Total", "", subTotal.toFixed(2), true);

    if (ob !== 0) {
      const isOwed = ob < 0;
      row2(
        isOwed ? "(+) Last Month Due" : "(-) Last Month Adv.",
        Math.abs(ob).toFixed(2)
      );
      note(isOwed ? "Carried fwd, unpaid last month" : "Carried fwd, extra paid last month");
    }

    dashes();
    row2("TOTAL", `Rs ${due.toFixed(2)}`, true);
    row2(`Paid (${method})`, `Rs ${paid.toFixed(2)}`, true);

    if (balance > 0) {
      row2("Balance Due", `Rs ${balance.toFixed(2)}`, true);
      note("Carries fwd to next month if unpaid");
    } else if (advance > 0) {
      row2("Advance c/f", `Rs ${advance.toFixed(2)}`, true);
      note("Adjusted against next month's bill");
    } else {
      row2("Balance", "Rs 0.00", true);
      note("Fully paid - no balance due");
    }
    printLine(`Paid On: ${paidDate(r.payment_timestamp)}`);

    blank();
    dashes();
    const stampWord = statusLabel(r.payment_status).toUpperCase();
    center(`*** ${stampWord} ***`, true);
    blank();
    center(
      isPaid
        ? "Thank you for your payment!"
        : isPartial
          ? "Balance due next cycle."
          : "Payment pending - pay early."
    );
    blank();
    center("Computer-generated receipt");
    center("E & O.E");
  });

  const flatPart = `Flat${flatNumber.replace(/\s+/g, "")}`;
  const periodPart = monthLabel(r.month, r.year).replace(" ", "_");
  doc.save(`Receipt_${flatPart}_${periodPart}.pdf`);
}

// ─── Monthly Summary PDF — Thermal Roll Style ──────────────────────────────
// Same till-roll grid as the receipt above: one block per flat (Due / Paid /
// Balance / Status), then a TOTALS block at the end.

export function exportMonthlySummaryPdf(opts: {
  month: number; year: number;
  ownerName?: string; ownerMobile?: string;
  rows: FlatSummaryRow[];
}) {
  const { month, year, ownerName, ownerMobile, rows } = opts;
  const M = 5;

  const doc = buildThermalPdf(M, (h) => {
    const { printLine, blank, dashes, center, row2 } = h;

    center(ownerName || "TildaRoom Properties", true);
    if (ownerMobile) center(`Mob: ${ownerMobile}`);
    blank();
    center("MONTHLY COLLECTION SUMMARY", true);
    center(monthLabel(month, year));
    center(`Date: ${today()}`);
    dashes();

    let totalDue = 0, totalPaid = 0;
    for (const r of rows) {
      const bal = Math.max(0, r.totalDue - r.amountPaid);
      totalDue += r.totalDue;
      totalPaid += r.amountPaid;

      printLine(`Flat ${r.flatNumber}`, true);
      printLine(r.tenantName || "-");
      row2("Total Due", rsT(r.totalDue));
      row2("Paid", rsT(r.amountPaid));
      row2(bal > 0 ? "Balance Due" : "Balance", rsT(bal), bal > 0);
      center(`[ ${statusLabel(r.paymentStatus).toUpperCase()} ]`, true);
      dashes();
    }

    const totalBal = Math.max(0, totalDue - totalPaid);
    row2("TOTAL DUE", rsT(totalDue), true);
    row2("TOTAL PAID", rsT(totalPaid), true);
    row2(totalBal > 0 ? "TOTAL BALANCE DUE" : "TOTAL BALANCE", rsT(totalBal), true);
    dashes();
    blank();
    center(`Flats: ${rows.length}`);
    blank();
    center("Computer-generated summary");
    center("E & O.E");
  });

  doc.save(`Summary_${monthLabel(month, year).replace(" ", "_")}.pdf`);
}
