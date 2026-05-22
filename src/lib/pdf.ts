import jsPDF from "jspdf";
import { monthLabel, statusLabel, type PaymentStatus } from "./billing";

interface ReadingPdf {
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

// Clean fallback utility replacing standard currency symbol rules with an explicit "Rs." string
function formatRs(n: number) {
  return `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
}

// Formatter to isolate a crisp 10-digit WhatsApp/Mobile layout value (stripping +91 / 91 prefixes)
function parseTenDigitMobile(mobileStr: string | undefined): string | null {
  if (!mobileStr) return null;
  // Remove all non-digits
  const digits = mobileStr.replace(/\D/g, "");
  // If it starts with 91 and is 12 digits total, peel off the 91
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  // Otherwise take the trailing 10 digits if long enough
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits; 
}

export function exportReadingPdf(opts: {
  reading: ReadingPdf;
  flatNumber: string;
  tenantName: string;
  tenantMobile?: string; // Appended parameter to extract real contact records
  ownerName?: string;
}) {
  const { reading: r, flatNumber, tenantName, tenantMobile, ownerName } = opts;
  
  // Custom 80mm roll width optimized for professional thermal layout engines
  const doc = new jsPDF({
    unit: "mm",
    format: [80, 180],
  });

  const W = doc.internal.pageSize.getWidth(); // 80mm
  let y = 10;

  // Helper for drawing sharp dashed dividers typical of high-density printers
  const drawDashedLine = (currentY: number) => {
    doc.setDrawColor(150);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(6, currentY, W - 6, currentY);
    doc.setLineDashPattern([], 0); // Reset dash engine
  };

  // Helper for structured item spacing (left-aligned labels with right-aligned values)
  const rowL = (label: string, value: string, isBold = false) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.text(label, 6, y);
    doc.text(value, W - 6, y, { align: "right" });
    y += 5;
  };

  // --- HEADER SECTION ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(ownerName || "INVOICE", W / 2, y, { align: "center" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  
  // 1. Room/Flat Identification
  doc.text(`Room/Flat: ${flatNumber}`, W / 2, y, { align: "center" });
  y += 4;
  
  // 2. Tenant profile layout block with parsed 10-digit raw mobile verification
  const cleanMobile = parseTenDigitMobile(tenantMobile);
  const identityString = cleanMobile ? `${tenantName} (${cleanMobile})` : tenantName;
  doc.text(`Tenant: ${identityString}`, W / 2, y, { align: "center" });
  y += 4;

  // 3. Billing Period timeline tracking reference row
  doc.text(`Period: ${monthLabel(r.month, r.year)}`, W / 2, y, { align: "center" });
  y += 6;

  doc.setTextColor(0);
  drawDashedLine(y);
  y += 5;

  // --- INVOICE RUN TRACKING ---
  doc.setFontSize(8);
  if (r.payment_timestamp) {
    const dateStr = new Date(r.payment_timestamp).toLocaleDateString("en-IN");
    rowL("Date:", dateStr);
  }
  rowL("Status:", statusLabel(r.payment_status).toUpperCase(), true);
  
  y += 2;
  drawDashedLine(y);
  y += 5;

  // --- ELECTRICITY METER LOGS ---
  if (r.curr_reading !== null) {
    doc.setFont("helvetica", "bold");
    doc.text("Electricity Metrics", 6, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    
    rowL(`  Current Reading:`, String(r.curr_reading));
    rowL(`  Previous Reading:`, String(r.prev_reading));
    rowL(`  Units Consumed:`, `${r.units} units`);
    rowL(`  Rate per Unit:`, `${formatRs(r.rate_per_unit)}/unit`);
    
    y += 2;
    drawDashedLine(y);
    y += 5;
  }

  // --- ITEMIZED RECEIPT ENTRIES ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Particulars", 6, y);
  doc.text("Amount", W - 6, y, { align: "right" });
  y += 4.5;

  doc.setFontSize(8);
  rowL("Rent Charges", formatRs(Number(r.rent)));
  rowL("Electricity Bill", formatRs(Number(r.electricity_bill)));
  
  if (Number(r.maintenance ?? 0) > 0) {
    rowL("Maintenance", formatRs(Number(r.maintenance ?? 0)));
  }
  if (Number(r.other_charges) > 0) {
    rowL("Other Charges", formatRs(Number(r.other_charges)));
  }
  
  if (Number(r.opening_balance) !== 0) {
    const isAdvance = Number(r.opening_balance) > 0;
    rowL(
      isAdvance ? "Prev Month Advance" : "Prev Arrears / Balance",
      `${isAdvance ? "-" : "+"} ${formatRs(Math.abs(Number(r.opening_balance)))}`
    );
  }

  y += 2;
  drawDashedLine(y);
  y += 5;

  // --- OUTSTANDING BALANCES & TOTALS ---
  doc.setFontSize(9);
  rowL("Total Amount Due:", formatRs(Number(r.total_due)), true);
  rowL("Total Amount Paid:", formatRs(Number(r.amount_paid)));
  
  const balance = Number(r.total_due) - Number(r.amount_paid);
  rowL("Remaining Balance:", formatRs(balance), true);

  // --- TRANSACTION RECORD FOOTER ---
  if (r.payment_method) {
    y += 2;
    drawDashedLine(y);
    y += 5;
    doc.setFontSize(8);
    rowL("Paid Via:", r.payment_method);
  }

  y += 8;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("Thank you for payment!", W / 2, y, { align: "center" });

  // Download Action Engine
  doc.save(`Invoice_${flatNumber}_${r.month}_${r.year}.pdf`);
}