import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Zap, Home, Eye, IndianRupee } from "lucide-react";
import { balanceDue, formatINR, monthLabel, roundBillAmount, statusColor, statusLabel, type PaymentStatus } from "@/lib/billing";
import { OwnerReadingDialog } from "@/components/owner-reading-dialog";
import { OwnerPaymentDialog } from "@/components/owner-payment-dialog";
import { FlatDialog } from "@/components/flat-dialog";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Flat {
  id: string; flat_number: string; tenant_id: string | null;
  tenant_name: string; tenant_mobile: string; tenant_whatsapp: string;
  rent: number; maintenance: number; other_charges: number;
  prev_meter_reading: number; security_deposit: number;
  is_vacant?: boolean;
  due_date?: number | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Reading {
  id: string; flat_id: string; month: number; year: number;
  prev_reading: number; curr_reading: number | null; units: number;
  rate_per_unit: number; electricity_bill: number; rent: number;
  maintenance: number; other_charges: number; opening_balance: number;
  total_due: number; amount_paid: number; payment_status: PaymentStatus;
  payment_method: string | null; payment_timestamp: string | null;
  source?: string;
}

interface FlatCardProps {
  flat: Flat;
  reading?: Reading;
  allReadings: Reading[];
  monthRate: number;
  month: number;
  year: number;
  onChange: () => void;
}

export function FlatCard({ flat, reading, allReadings, monthRate, month, year, onChange }: FlatCardProps) {
  const navigate = useNavigate();
  const [togglingVacant, setTogglingVacant] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const isVacant = flat.is_vacant ?? false;

  const openTenantView = () => {
    navigate({ to: "/tenant", search: { flat: flat.id } });
  };
  const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

  const status: PaymentStatus = reading?.payment_status ?? "pending";
  const fallbackDue = roundBillAmount(Number(flat.rent) + Number(flat.maintenance ?? 0) + Number(flat.other_charges));

  // Opening balance: unpaid (or overpaid) amount carried from the tenant's
  // most recent prior reading — same logic as tenant.tsx / owner.tsx.
  const openingBalance = (() => {
    const prev = [...allReadings]
      .filter((r) => r.flat_id === flat.id && !(r.month === month && r.year === year))
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    if (!prev) return 0;
    const approved = prev.payment_status === "paid" || prev.payment_status === "partial";
    return (approved ? Number(prev.amount_paid) : 0) - roundBillAmount(Number(prev.total_due));
  })();

  const due = reading
    ? balanceDue(Number(reading.total_due), Number(reading.amount_paid))
    : roundBillAmount(fallbackDue - openingBalance);
  const flatReadings = allReadings.filter((r) => r.flat_id === flat.id);
  const hasReading = reading?.curr_reading != null;

  const waNumber = (flat.tenant_whatsapp || "").replace(/\D/g, "");

  // Amount to remind about: deduct any partial payment already made this
  // month; if fully unpaid, use the full bill; if no reading yet, fall
  // back to base charges adjusted for opening balance carried forward.
  const toBePaid = reading
    ? balanceDue(Number(reading.total_due), Number(reading.amount_paid))
    : null;
  const dueAmount = toBePaid !== null && toBePaid > 0
    ? toBePaid
    : reading
      ? roundBillAmount(Number(reading.total_due))
      : fallbackDue - openingBalance;
  const monthName = MONTH_NAMES[month - 1];
  const electricityNote = reading
    ? " (including electricity charges)"
    : " (excluding electricity charges)";
  const dueClause = flat.due_date
    ? ` your due date is ${String(flat.due_date).padStart(2, "0")}/${monthName}`
    : "";
  const waMessage = `Mr. ${flat.tenant_name || "Tenant"} your rent is due for the ${monthName} month that is ₹${Math.round(dueAmount)}${electricityNote}${dueClause} please pay timely, Ignore if already paid. Thank You`;

  const toggleVacant = async () => {
    setTogglingVacant(true);
    const newVal = !isVacant;
    const { error } = await supabase
      .from("flats")
      .update({ is_vacant: newVal })
      .eq("id", flat.id);
    setTogglingVacant(false);
    if (error) { toast.error(error.message); return; }
    toast.success(newVal ? `Flat ${flat.flat_number} marked vacant` : `Flat ${flat.flat_number} is active again`);
    onChange();
  };

  return (
    <Card
      onClick={() => setEditOpen(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") setEditOpen(true); }}
      className={`p-3 sm:p-4 hover:shadow-md transition-shadow cursor-pointer ${isVacant ? "opacity-60 border-dashed" : ""}`}
      style={{ boxShadow: isVacant ? "none" : "var(--shadow-card)" }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">Flat {flat.flat_number}</h3>
            {isVacant ? (
              <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                <Home className="h-3 w-3 mr-1" /> VACANT
              </Badge>
            ) : (
              <Badge className={statusColor(status)}>{statusLabel(status)}</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5 truncate">
            {flat.tenant_name || "(no tenant)"}
            {flat.tenant_mobile && ` • ${flat.tenant_mobile}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={stop}>
          {!isVacant && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); openTenantView(); }}
              title="Open tenant view"
            >
              <Eye className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">View Tenant</span>
            </Button>
          )}
          {waNumber && !isVacant && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-success" asChild
              title={reading ? "Send bill reminder" : "Remind to submit reading"}>
              <a href={`https://wa.me/91${waNumber}?text=${encodeURIComponent(waMessage)}`}
                target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <MessageCircle className="h-4 w-4" />
              </a>
            </Button>
          )}
          <FlatDialog flat={flat} onSaved={onChange} open={editOpen} onOpenChange={setEditOpen} hideTrigger />
        </div>
      </div>

      {isVacant ? (
        /* Vacant state: show zero charges message */
        <div className="mt-3 rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          All charges are zero while flat is vacant.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Rent</div>
            <div className="font-medium">{formatINR(Number(flat.rent))}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Maintenance</div>
            <div className="font-medium">{formatINR(Number(flat.maintenance ?? 0))}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Other</div>
            <div className="font-medium">{formatINR(Number(flat.other_charges))}</div>
          </div>
          {reading ? (
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Bill ({Number(reading.units).toFixed(0)}u)</div>
              <div className="font-medium">{formatINR(Number(reading.electricity_bill))}</div>
            </div>
          ) : (
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground italic">No reading yet</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            {isVacant ? (
              <div className="text-lg font-bold text-muted-foreground">{formatINR(0)}</div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">{status === "paid" ? "Paid" : "Due"}</div>
                <div className="text-lg font-bold">
                  {formatINR(reading ? roundBillAmount(Number(reading.total_due)) : due)}
                </div>
                {/* Only show balance due when NOT fully paid */}
                {status !== "paid" && due > 0 && reading && (
                  <div className="text-xs text-destructive">Balance due {formatINR(due)}</div>
                )}
              </>
            )}
          </div>

          <div className="shrink-0" onClick={stop}>
            {/* Vacant toggle button */}
            <Button
              size="sm"
              variant={isVacant ? "default" : "outline"}
              onClick={(e) => { e.stopPropagation(); toggleVacant(); }}
              disabled={togglingVacant}
              className={`text-xs ${isVacant ? "bg-muted-foreground" : ""}`}
              title={isVacant ? "Mark as occupied" : "Mark as vacant"}
            >
              <Home className="h-3.5 w-3.5 mr-1" />
              {isVacant ? "Vacant: ON" : "Vacant: OFF"}
            </Button>
          </div>
        </div>

        {!isVacant && (
          <div className="grid gap-2 sm:grid-cols-2" onClick={stop}>
            <OwnerReadingDialog
              flat={flat}
              readings={flatReadings}
              monthRate={monthRate}
              current={reading}
              onSaved={onChange}
              trigger={
                <Button size="sm" variant="outline" className="w-full" onClick={(e) => e.stopPropagation()}>
                  <Zap className="h-4 w-4 mr-1 shrink-0" />
                  <span className="truncate">
                    {hasReading ? "Edit Current Month Reading" : "Enter Current Month Reading"}
                  </span>
                </Button>
              }
            />
            <OwnerPaymentDialog
              flat={flat}
              reading={reading}
              allReadings={allReadings}
              onSaved={onChange}
              trigger={
                <Button size="sm" className="w-full" onClick={(e) => e.stopPropagation()}>
                  <IndianRupee className="h-4 w-4 mr-1 shrink-0" />
                  Add Payment
                </Button>
              }
            />
          </div>
        )}
      </div>
    </Card>
  );
}

