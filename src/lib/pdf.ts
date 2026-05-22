import jsPDF from "jspdf";
import { formatINR, monthLabel, statusLabel, type PaymentStatus } from "./billing";

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

export function exportReadingPdf(opts: {
  reading: ReadingPdf;
  flatNumber: string;
  tenantName: string;
  ownerName?: string;
}) {
  const { reading: r, flatNumber, tenantName, ownerName } = opts;
  
  // Create a custom 80mm width page size typical for professional thermal printer receipts
  // [width, height] in mm. 180mm height provides ample room for the breakdown.
  const doc = new jsPDF({
    unit: "mm",
    format: [80, 180],
  });

  const W = doc.internal.pageSize.getWidth(); // 80mm
  let y = 10;

  // Helper for drawing clean dashed separation lines
  const drawDashedLine = (currentY: number) => {
    doc.setDrawColor(150);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(6, currentY, W - 6, currentY);
    doc.setLineDashPattern([], 0); // Reset line pattern
  };

  // Helper for structured key-value alignment (left aligned label, right aligned value)
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
  doc.text(`Room/Flat: ${flatNumber}`, W / 2, y, { align: "center" });
  y += 4;
  doc.text(`Period: ${monthLabel(r.month, r.year)}`, W / 2, y, { align: "center" });
  y += 6;

  doc.setTextColor(0);
  drawDashedLine(y);
  y += 5;

  // --- TENANT & INVOICE INFO ---
  doc.setFontSize(8);
  rowL("Tenant:", tenantName, true);
  if (r.payment_timestamp) {
    const dateStr = new Date(r.payment_timestamp).toLocaleDateString("en-IN");
    rowL("Date:", dateStr);
  }
  rowL("Status:", statusLabel(r.payment_status).toUpperCase(), true);
  
  y += 2;
  drawDashedLine(y);
  y += 5;

  // --- ELECTRICITY METER SUB-TABLE ---
  if (r.curr_reading !== null) {
    doc.setFont("helvetica", "bold");
    doc.text("Electricity Metrics", 6, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    
    rowL(`  Current Reading:`, String(r.curr_reading));
    rowL(`  Previous Reading:`, String(r.prev_reading));
    rowL(`  Units Consumed:`, `${r.units} units`);
    rowL(`  Rate per Unit:`, `${formatINR(r.rate_per_unit)}/unit`);
    
    y += 2;
    drawDashedLine(y);
    y += 5;
  }

  // --- ITEMISED BILL BREAKDOWN ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Particulars", 6, y);
  doc.text("Amount", W - 6, y, { align: "right" });
  y += 4.5;

  doc.setFontSize(8);
  rowL("Rent Charges", formatINR(Number(r.rent)));
  rowL("Electricity Bill", formatINR(Number(r.electricity_bill)));
  
  if (Number(r.maintenance ?? 0) > 0) {
    rowL("Maintenance", formatINR(Number(r.maintenance ?? 0)));
  }
  if (Number(r.other_charges) > 0) {
    rowL("Other Charges", formatINR(Number(r.other_charges)));
  }
  
  if (Number(r.opening_balance) !== 0) {
    const isAdvance = Number(r.opening_balance) > 0;
    rowL(
      isAdvance ? "Prev Month Advance" : "Prev Arrears / Balance",
      `${isAdvance ? "-" : "+"} ${formatINR(Math.abs(Number(r.opening_balance)))}`
    );
  }

  y += 2;
  drawDashedLine(y);
  y += 5;

  // --- SUMMARY TOTALS ---
  doc.setFontSize(9);
  rowL("Total Amount Due:", formatINR(Number(r.total_due)), true);
  rowL("Total Amount Paid:", formatINR(Number(r.amount_paid)));
  
  const balance = Number(r.total_due) - Number(r.amount_paid);
  rowL("Remaining Balance:", formatINR(balance), true);

  // --- FOOTER PAYMENT DETAILS ---
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
  doc.text("Thank you for your stay!", W / 2, y, { align: "center" });

  // Save/Download file execution
  doc.save(`Invoice_${flatNumber}_${r.month}_${r.year}.pdf`);
}