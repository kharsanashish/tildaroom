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

export function roundBillAmount(amount: number) {
  if (!Number.isFinite(amount)) return 0;
  const sign = amount < 0 ? -1 : 1;
  const value = Math.abs(amount);
  const base = Math.floor(value);
  const fraction = value - base;
  return sign * (fraction < 0.8 ? base : Math.ceil(value));
}

export function balanceDue(totalDue: number, amountPaid: number) {
  return Math.max(0, roundBillAmount(totalDue) - Number(amountPaid || 0));
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

export type PaymentStatus = "pending" | "partial" | "paid" | "pending_approval" | "rejected";

export function statusColor(status: PaymentStatus) {
  switch (status) {
    case "paid": return "bg-success text-success-foreground";
    case "partial": return "bg-warning text-warning-foreground";
    case "pending_approval": return "bg-info text-info-foreground";
    case "rejected": return "bg-destructive text-destructive-foreground";
    default: return "bg-destructive/90 text-destructive-foreground";
  }
}

export function statusLabel(status: PaymentStatus) {
  switch (status) {
    case "paid": return "Approved";
    case "partial": return "Partial";
    case "pending_approval": return "Pending Approval";
    case "rejected": return "Rejected";
    default: return "Pending";
  }
}
