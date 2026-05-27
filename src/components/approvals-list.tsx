import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatINR, monthLabel, type PaymentStatus } from "@/lib/billing";

interface Flat {
  id: string;
  flat_number: string;
  tenant_name: string;
}

interface Reading {
  id: string;
  flat_id: string;
  month: number;
  year: number;
  total_due: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
}

export function ApprovalsList({
  flats,
  readings,
  onChange,
}: {
  flats: Flat[];
  readings: Reading[];
  onChange: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "upi" | "cash">("all");
  const [actionId, setActionId] = useState<string | null>(null);

  const pending = readings
    .filter((r) => r.payment_status === "pending_approval")
    .filter((r) => filter === "all" || r.payment_method === filter)
    .sort((a, b) => b.year - a.year || b.month - a.month);

  const approve = async (r: Reading) => {
    setActionId(r.id);
    const isFull = Number(r.amount_paid) >= Number(r.total_due);
    const { error } = await supabase.from("meter_readings").update({
      payment_status: isFull ? "paid" : "partial",
      payment_timestamp: new Date().toISOString(),
    }).eq("id", r.id);
    setActionId(null);
    if (error) toast.error(error.message);
    else { toast.success(isFull ? "Approved as paid" : "Approved as partial"); onChange(); }
  };

  const reject = async (r: Reading) => {
    setActionId(r.id);
    const { error } = await supabase.from("meter_readings").update({
      payment_status: "rejected",
      amount_paid: 0,
    }).eq("id", r.id);
    setActionId(null);
    if (error) toast.error(error.message);
    else { toast.success("Rejected"); onChange(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          size="sm"
          variant={filter === "upi" ? "default" : "outline"}
          onClick={() => setFilter("upi")}
        >
          UPI
        </Button>
        <Button
          size="sm"
          variant={filter === "cash" ? "default" : "outline"}
          onClick={() => setFilter("cash")}
        >
          Cash
        </Button>
      </div>

      {pending.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          No pending approvals
        </Card>
      ) : (
        <div className="space-y-2">
          {pending.map((r) => {
            const flat = flats.find((f) => f.id === r.flat_id);
            const isPartial = Number(r.amount_paid) < Number(r.total_due);
            const busy = actionId === r.id;
            return (
              <Card key={r.id} className="p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      Flat {flat?.flat_number} • {flat?.tenant_name || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {monthLabel(r.month, r.year)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="capitalize">
                        {r.payment_method || "upi"}
                      </Badge>
                      {isPartial && (
                        <Badge className="bg-warning text-warning-foreground">
                          Partial
                        </Badge>
                      )}
                    </div>
                    <div className="text-base font-semibold mt-1">
                      {formatINR(Number(r.amount_paid))}
                      <span className="text-xs text-muted-foreground ml-1">
                        of {formatINR(Number(r.total_due))}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reject(r)}
                      disabled={busy}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approve(r)}
                      disabled={busy}
                      style={{
                        background: "var(--success)",
                        color: "var(--success-foreground)",
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
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
