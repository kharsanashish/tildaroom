import jsPDF from "jspdf";
import { formatINR, monthLabel, statusLabel, type PaymentStatus } from "./billing";

interface ReadingPdf {
  month: number; year: number;
  prev_reading: number; curr_reading: number | null; units: number;
  rate_per_unit: number; electricity_bill: number;
  rent: number; maintenance?: number; other_charges: number; opening_balance: number;
  total_due: number; amount_paid: number; payment_status: PaymentStatus;
  payment_method?: string | null; payment_timestamp?: string | null;
}

export function exportReadingPdf(opts: {
  reading: ReadingPdf;
  flatNumber: string;
  tenantName: string;
  ownerName?: string;
}) {
  const { reading: r, flatNumber, tenantName, ownerName } = opts;
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  let y = 18;

  doc.setFontSize(18);
  doc.text("Rent & Electricity Bill", W / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`${monthLabel(r.month, r.year)}`, W / 2, y, { align: "center" });
  y += 10;
  doc.setTextColor(0);

  doc.setFontSize(11);
  const rowL = (label: string, value: string) => {
    doc.text(label, 16, y);
    doc.text(value, W - 16, y, { align: "right" });
    y += 7;
  };

  rowL("Flat Number", flatNumber);
  rowL("Tenant Name", tenantName || "-");
  if (ownerName) rowL("Owner", ownerName);
  y += 4;
  doc.setDrawColor(200); doc.line(16, y, W - 16, y); y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Meter Reading", 16, y); y += 7;
  doc.setFont("helvetica", "normal");
  rowL("Previous Reading", String(r.prev_reading));
  rowL("Current Reading", r.curr_reading != null ? String(r.curr_reading) : "-");
  rowL("Units Consumed", `${Number(r.units).toFixed(0)}`);
  rowL("Rate / Unit", formatINR(Number(r.rate_per_unit)));

  y += 2;
  doc.setDrawColor(200); doc.line(16, y, W - 16, y); y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Bill Breakdown", 16, y); y += 7;
  doc.setFont("helvetica", "normal");
  rowL("Electricity Bill", formatINR(Number(r.electricity_bill)));
  rowL("Rent", formatINR(Number(r.rent)));
  rowL("Maintenance", formatINR(Number(r.maintenance ?? 0)));
  rowL("Other Charges", formatINR(Number(r.other_charges)));
  if (Number(r.opening_balance) !== 0) {
    rowL(
      Number(r.opening_balance) > 0 ? "Advance (last month)" : "Balance due (last month)",
      `${Number(r.opening_balance) > 0 ? "-" : "+"} ${formatINR(Math.abs(Number(r.opening_balance)))}`,
    );
  }

  y += 2;
  doc.setDrawColor(0); doc.line(16, y, W - 16, y); y += 7;
  doc.setFont("helvetica", "bold");
  rowL("Total Due", formatINR(Number(r.total_due)));
  rowL("Amount Paid", formatINR(Number(r.amount_paid)));
  rowL("Balance", formatINR(Number(r.total_due) - Number(r.amount_paid)));

  y += 4;
  doc.setFont("helvetica", "normal");
  rowL("Payment Status", statusLabel(r.payment_status));
  if (r.payment_method) rowL("Payment Method", r.payment_method.toUpperCase());
  if (r.payment_timestamp) rowL("Paid On", new Date(r.payment_timestamp).toLocaleString());

  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, W / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });

  doc.save(`Flat-${flatNumber}-${monthLabel(r.month, r.year).replace(" ", "-")}.pdf`);
}
