import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatINR, monthLabel, type PaymentStatus } from "@/lib/billing";
import { sendPush } from "@/lib/push";
import type { PaymentInstallment } from "@/lib/payments";
import { exportPaymentReceiptPdf } from "@/lib/pdf";

interface Flat {
  id: string;
  flat_number: string;
  tenant_name: string;
  tenant_whatsapp?: string;
  tenant_id: string | null;
}

interface Reading {
  id: string;
  flat_id: string;
  month: number;
  year: number;
  prev_reading: number;
  curr_reading: number | null;
  units: number;
  rate_per_unit: number;
  electricity_bill: number;
  rent: number;
  maintenance: number;
  other_charges: number;
  opening_balance: number;
  total_due: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_timestamp: string | null;
}

interface Settings { owner_name?: string; owner_mobile?: string }

export function ApprovalsList({
  flats,
  readings,
  settings,
  onChange,
}: {
  flats: Flat[];
  readings: Reading[];
  settings?: Settings | null;
  onChange: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "upi" | "cash">("all");
  const [payments, setPayments] = useState<PaymentInstallment[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("payments").select("*")
      .order("submitted_at", { ascending: false });
    if (error) return toast.error(error.message);
    setPayments((data as PaymentInstallment[]) ?? []);
  };
  useEffect(() => { load(); }, [readings]);

  const pending = payments
    .filter((p) => p.status === "pending_approval")
    .filter((p) => filter === "all" || p.method === filter);

  const approve = async (p: PaymentInstallment) => {
    setActionId(p.id);
    const { error } = await supabase.from("payments").update({
      status: "approved",
      approved_at: new Date().toISOString(),
    }).eq("id", p.id);
    setActionId(null);
    if (error) { toast.error(error.message); return; }

    const r = readings.find((x) => x.id === p.reading_id);
    const flat = flats.find((f) => f.id === p.flat_id);
    toast.success("Payment approved");

    if (flat?.tenant_id && r) {
      await sendPush({
        toUserId: flat.tenant_id,
        title: "Payment Approved ✅",
        body: `Your payment of ₹${Number(p.amount).toFixed(0)} for ${monthLabel(r.month, r.year)} has been approved.`,
        url: "/tenant",
        tag: "payment-approved",
      });
    }
    await load();
    onChange();
  };

  const reject = async (p: PaymentInstallment) => {
    setActionId(p.id);
    const { error } = await supabase.from("payments").update({
      status: "rejected",
    }).eq("id", p.id);
    setActionId(null);
    if (error) { toast.error(error.message); return; }

    const r = readings.find((x) => x.id === p.reading_id);
    const flat = flats.find((f) => f.id === p.flat_id);
    toast.success("Rejected");

    if (flat?.tenant_id && r) {
      await sendPush({
        toUserId: flat.tenant_id,
        title: "Payment Rejected ❌",
        body: `Your payment for ${monthLabel(r.month, r.year)} was rejected. Please contact the owner.`,
        url: "/tenant",
        tag: "payment-rejected",
      });
    }
    await load();
    onChange();
  };

  const downloadReceipt = (p: PaymentInstallment) => {
    const r = readings.find((x) => x.id === p.reading_id);
    const flat = flats.find((f) => f.id === p.flat_id);
    if (!r || !flat) return toast.error("Cannot find related bill");
    const all = payments
      .filter((x) => x.reading_id === p.reading_id)
      .sort((a, b) => +new Date(a.submitted_at) - +new Date(b.submitted_at));
    const idx = all.findIndex((x) => x.id === p.id) + 1;
    const paidBefore = all
      .slice(0, idx - 1)
      .filter((x) => x.status === "approved")
      .reduce((s, x) => s + Number(x.amount), 0);
    exportPaymentReceiptPdf({
      reading: r,
      payment: p,
      installmentIndex: idx,
      paidBefore,
      flatNumber: flat.flat_number,
      tenantName: flat.tenant_name,
      tenantMobile: flat.tenant_whatsapp,
      ownerName: settings?.owner_name,
      ownerMobile: settings?.owner_mobile,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
        <Button size="sm" variant={filter === "upi" ? "default" : "outline"} onClick={() => setFilter("upi")}>UPI</Button>
        <Button size="sm" variant={filter === "cash" ? "default" : "outline"} onClick={() => setFilter("cash")}>Cash</Button>
      </div>

      {pending.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">No pending approvals</Card>
      ) : (
        <div className="space-y-2">
          {pending.map((p) => {
            const r = readings.find((x) => x.id === p.reading_id);
            const flat = flats.find((f) => f.id === p.flat_id);
            const approvedBefore = payments
              .filter((x) => x.reading_id === p.reading_id && x.status === "approved")
              .reduce((s, x) => s + Number(x.amount), 0);
            const busy = actionId === p.id;
            return (
              <Card key={p.id} className="p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      Flat {flat?.flat_number} • {flat?.tenant_name || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r ? monthLabel(r.month, r.year) : "—"} • Receipt {p.receipt_no || "—"}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="capitalize">{p.method || "upi"}</Badge>
                      {approvedBefore > 0 && (
                        <Badge className="bg-info text-info-foreground">
                          Installment
                        </Badge>
                      )}
                    </div>
                    <div className="text-base font-semibold mt-1">
                      {formatINR(Number(p.amount))}
                      {r && (
                        <span className="text-xs text-muted-foreground ml-1">
                          of {formatINR(Number(r.total_due))} due
                          {approvedBefore > 0 && ` • already paid ${formatINR(approvedBefore)}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => reject(p)} disabled={busy}>
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => approve(p)}
                        disabled={busy}
                        style={{ background: "var(--success)", color: "var(--success-foreground)" }}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                      </Button>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => downloadReceipt(p)}>
                      <FileDown className="h-3 w-3 mr-1" /> Receipt
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
