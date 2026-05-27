import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Zap } from "lucide-react";
import { formatINR, monthLabel, statusColor, statusLabel, type PaymentStatus } from "@/lib/billing";
import { OwnerReadingDialog } from "@/components/owner-reading-dialog";
import { FlatDialog } from "@/components/flat-dialog";

interface Flat {
  id: string;
  flat_number: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_mobile: string;
  tenant_whatsapp: string;
  rent: number;
  maintenance: number;
  other_charges: number;
  prev_meter_reading: number;
  security_deposit: number;
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

interface FlatCardProps {
  flat: Flat;
  reading?: Reading;
  allReadings: Reading[];
  monthRate: number;
  month: number;
  year: number;
  onChange: () => void;
}

export function FlatCard({
  flat,
  reading,
  allReadings,
  monthRate,
  month,
  year,
  onChange,
}: FlatCardProps) {
  const status: PaymentStatus = reading?.payment_status ?? "pending";
  const fallbackDue =
    Number(flat.rent) + Number(flat.maintenance ?? 0) + Number(flat.other_charges);
  const due = reading
    ? Number(reading.total_due) - Number(reading.amount_paid)
    : fallbackDue;
  const flatReadings = allReadings.filter((r) => r.flat_id === flat.id);
  const canEditReading = status !== "paid" && status !== "pending_approval";
  const waNumber = (flat.tenant_whatsapp || "").replace(/\D/g, "");

  // FIX: WhatsApp pre-filled message based on reading state
  const waMessage = reading
    ? `Hi ${flat.tenant_name || "Tenant"}, your bill for ${monthLabel(month, year)} is ₹${Number(reading.total_due).toFixed(0)}. Please pay at your earliest convenience.`
    : `Hi ${flat.tenant_name || "Tenant"}, please submit your meter reading for ${monthLabel(month, year)}.`;

  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Flat {flat.flat_number}</h3>
            <Badge className={statusColor(status)}>{statusLabel(status)}</Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {flat.tenant_name || "(no tenant)"}
            {flat.tenant_mobile && ` • ${flat.tenant_mobile}`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {waNumber && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-success"
              asChild
              title={
                reading ? "Send bill reminder" : "Remind to submit reading"
              }
            >
              <a
                href={`https://wa.me/91${waNumber}?text=${encodeURIComponent(waMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </Button>
          )}
          <FlatDialog flat={flat} onSaved={onChange} />
        </div>
      </div>

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
            <div className="text-xs text-muted-foreground">
              Bill ({Number(reading.units).toFixed(0)}u)
            </div>
            <div className="font-medium">
              {formatINR(Number(reading.electricity_bill))}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-xs text-muted-foreground italic">
              No reading yet
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">
            {status === "paid" ? "Paid" : "Due"}
          </div>
          <div className="text-lg font-bold">
            {formatINR(reading ? Number(reading.total_due) : due)}
          </div>
          {/* BUG FIX: Only show balance due when NOT fully paid */}
          {status !== "paid" && due > 0 && reading && (
            <div className="text-xs text-destructive">
              Balance due {formatINR(due)}
            </div>
          )}
        </div>
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
                {reading ? "Update Reading" : "Enter Reading"}
              </Button>
            }
          />
        )}
      </div>
    </Card>
  );
}

