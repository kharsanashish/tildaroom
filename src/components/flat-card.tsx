import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Zap, Home } from "lucide-react";
import { formatINR, monthLabel, statusColor, statusLabel, type PaymentStatus } from "@/lib/billing";
import { OwnerReadingDialog } from "@/components/owner-reading-dialog";
import { FlatDialog } from "@/components/flat-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Flat {
  id: string; flat_number: string; tenant_id: string | null;
  tenant_name: string; tenant_mobile: string; tenant_whatsapp: string;
  rent: number; maintenance: number; other_charges: number;
  prev_meter_reading: number; security_deposit: number;
  is_vacant?: boolean;
}

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
  const isVacant = flat.is_vacant ?? false;

  const openTenantView = () => {
    navigate({ to: "/tenant", search: { flat: flat.id } });
  };
  const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

  const status: PaymentStatus = reading?.payment_status ?? "pending";
  const fallbackDue = Number(flat.rent) + Number(flat.maintenance ?? 0) + Number(flat.other_charges);
  const due = reading
    ? Number(reading.total_due) - Number(reading.amount_paid)
    : fallbackDue;
  const flatReadings = allReadings.filter((r) => r.flat_id === flat.id);
  const canEditReading = !isVacant && status !== "paid" && status !== "pending_approval";
  const waNumber = (flat.tenant_whatsapp || "").replace(/\D/g, "");

  const waMessage = reading
    ? `Hi ${flat.tenant_name || "Tenant"}, your bill for ${monthLabel(month, year)} is ₹${Number(reading.total_due).toFixed(0)}. Please pay at your earliest convenience.`
    : `Hi ${flat.tenant_name || "Tenant"}, please submit your meter reading for ${monthLabel(month, year)}.`;

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
      onClick={openTenantView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") openTenantView(); }}
      className={`p-4 hover:shadow-md transition-shadow cursor-pointer ${isVacant ? "opacity-60 border-dashed" : ""}`}
      style={{ boxShadow: isVacant ? "none" : "var(--shadow-card)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">Flat {flat.flat_number}</h3>
            {isVacant ? (
              <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                <Home className="h-3 w-3 mr-1" /> VACANT
              </Badge>
            ) : (
              <Badge className={statusColor(status)}>{statusLabel(status)}</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {flat.tenant_name || "(no tenant)"}
            {flat.tenant_mobile && ` • ${flat.tenant_mobile}`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {waNumber && !isVacant && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-success" asChild
              title={reading ? "Send bill reminder" : "Remind to submit reading"}>
              <a href={`https://wa.me/91${waNumber}?text=${encodeURIComponent(waMessage)}`}
                target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <MessageCircle className="h-4 w-4" />
              </a>
            </Button>
          )}
          <FlatDialog flat={flat} onSaved={onChange} />
        </div>
      </div>

      {isVacant ? (
        /* Vacant state: show zero charges message */
        <div className="mt-3 rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          All charges are zero while flat is vacant.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Rent</div>
            <div className="font-medium">{formatINR(Number(flat.rent))}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Maintenance</div>
            <div className="font-medium">{formatINR(Number(flat.maintenance ?? 0))}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Other</div>
            <div className="font-medium">{formatINR(Number(flat.other_charges))}</div>
          </div>
          {reading ? (
            <div>
              <div className="text-xs text-muted-foreground">Bill ({Number(reading.units).toFixed(0)}u)</div>
              <div className="font-medium">{formatINR(Number(reading.electricity_bill))}</div>
            </div>
          ) : (
            <div>
              <div className="text-xs text-muted-foreground italic">No reading yet</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2">
        <div>
          {isVacant ? (
            <div className="text-lg font-bold text-muted-foreground">{formatINR(0)}</div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">{status === "paid" ? "Paid" : "Due"}</div>
              <div className="text-lg font-bold">
                {formatINR(reading ? Number(reading.total_due) : due)}
              </div>
              {/* Only show balance due when NOT fully paid */}
              {status !== "paid" && due > 0 && reading && (
                <div className="text-xs text-destructive">Balance due {formatINR(due)}</div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Vacant toggle button */}
          <Button
            size="sm"
            variant={isVacant ? "default" : "outline"}
            onClick={toggleVacant}
            disabled={togglingVacant}
            className={`text-xs ${isVacant ? "bg-muted-foreground" : ""}`}
            title={isVacant ? "Mark as occupied" : "Mark as vacant"}
          >
            <Home className="h-3.5 w-3.5 mr-1" />
            {isVacant ? "Vacant: ON" : "Vacant: OFF"}
          </Button>

          {canEditReading && (
            <OwnerReadingDialog
              flat={flat}
              readings={flatReadings}
              monthRate={monthRate}
              current={reading}
              onSaved={onChange}
              trigger={
                <Button size="sm" variant="outline">
                  <Zap className="h-4 w-4 mr-1" />
                  {reading ? "Update" : "Enter Reading"}
                </Button>
              }
            />
          )}
        </div>
      </div>
    </Card>
  );
}
