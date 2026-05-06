export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(month: number, year: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function currentMonthYear() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

export function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function buildUpiLink(opts: {
  pa: string;
  pn: string;
  am: number;
  tn: string;
}) {
  const params = new URLSearchParams({
    pa: opts.pa,
    pn: opts.pn,
    am: opts.am.toFixed(2),
    cu: "INR",
    tn: opts.tn,
  });
  return `upi://pay?${params.toString()}`;
}

export type PaymentStatus = "pending" | "partial" | "paid";

export function statusColor(status: PaymentStatus) {
  switch (status) {
    case "paid": return "bg-success text-success-foreground";
    case "partial": return "bg-warning text-warning-foreground";
    default: return "bg-destructive/90 text-destructive-foreground";
  }
}

export function statusLabel(status: PaymentStatus) {
  return status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Pending";
}
