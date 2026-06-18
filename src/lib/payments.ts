// Payment installment shared types/helpers.

export type PaymentInstallmentStatus = "pending_approval" | "approved" | "rejected";

export interface PaymentInstallment {
  id: string;
  reading_id: string;
  flat_id: string;
  tenant_id: string | null;
  amount: number;
  method: "upi" | "cash" | string;
  status: PaymentInstallmentStatus;
  receipt_no: string | null;
  note: string | null;
  submitted_at: string;
  approved_at: string | null;
}

export function statusBadgeClass(status: PaymentInstallmentStatus) {
  switch (status) {
    case "approved": return "bg-success text-success-foreground";
    case "rejected": return "bg-destructive text-destructive-foreground";
    default: return "bg-info text-info-foreground";
  }
}

export function statusBadgeLabel(status: PaymentInstallmentStatus) {
  switch (status) {
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    default: return "Pending Approval";
  }
}

export function approvedSum(payments: PaymentInstallment[]) {
  return payments
    .filter((p) => p.status === "approved")
    .reduce((s, p) => s + Number(p.amount), 0);
}
