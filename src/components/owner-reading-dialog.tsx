import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { currentMonthYear, formatINR, monthLabel, type PaymentStatus } from "@/lib/billing";

interface Flat {
  id: string; flat_number: string; rent: number; maintenance: number; other_charges: number; prev_meter_reading: number;
}
interface Reading {
  id: string; flat_id: string; month: number; year: number;
  prev_reading: number; curr_reading: number | null; units: number;
  rate_per_unit: number; electricity_bill: number; rent: number; maintenance: number; other_charges: number;
  opening_balance: number; total_due: number; amount_paid: number; payment_status: PaymentStatus;
}

export function OwnerReadingDialog({
  flat, readings, monthRate, current, onSaved, trigger,
}: {
  flat: Flat;
  readings: Reading[];
  monthRate: number;
  current?: Reading;
  onSaved: () => void;
  trigger: React.ReactNode;
}) {
  const { month, year } = currentMonthYear();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(current?.curr_reading != null ? String(current.curr_reading) : "");
  const [saving, setSaving] = useState(false);

  const prevReading = useMemo(() => {
    if (current) return Number(current.prev_reading);
    const prev = [...readings]
      .filter((r) => !(r.month === month && r.year === year) && r.curr_reading != null)
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    return prev ? Number(prev.curr_reading) : Number(flat.prev_meter_reading ?? 0);
  }, [current, readings, month, year, flat]);

  const openingBalance = useMemo(() => {
    const prev = [...readings]
      .filter((r) => !(r.month === month && r.year === year))
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    if (!prev) return 0;
    const approved = prev.payment_status === "paid" || prev.payment_status === "partial";
    const effectivePaid = approved ? Number(prev.amount_paid) : 0;
    return effectivePaid - Number(prev.total_due);
  }, [readings, month, year]);

  const v = Number(val) || 0;
  const units = Math.max(0, v - prevReading);
  const electricity = units * monthRate;
  const rent = Number(flat.rent ?? 0);
  const maintenance = Number(flat.maintenance ?? 0);
  const other = Number(flat.other_charges ?? 0);
  const totalDue = rent + electricity + maintenance + other - openingBalance;

  const save = async () => {
    if (!v || v < prevReading) return toast.error(`Reading must be ≥ ${prevReading}`);
    setSaving(true);
    const payload = {
      flat_id: flat.id,
      month, year,
      prev_reading: prevReading,
      curr_reading: v,
      units,
      rate_per_unit: monthRate,
      electricity_bill: electricity,
      rent, maintenance, other_charges: other,
      opening_balance: openingBalance,
      total_due: totalDue,
      amount_paid: current?.amount_paid ?? 0,
      payment_status: current?.payment_status ?? ("pending" as PaymentStatus),
    };
    const { error } = current
      ? await supabase.from("meter_readings").update(payload).eq("id", current.id)
      : await supabase.from("meter_readings").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Reading saved");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" />
            Flat {flat.flat_number} • {monthLabel(month, year)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Previous</Label>
              <Input value={prevReading} readOnly className="bg-muted" />
            </div>
            <div>
              <Label className="text-xs">Current Reading</Label>
              <Input value={val} onChange={(e) => setVal(e.target.value)} type="number" inputMode="numeric" />
            </div>
          </div>
          <div className="rounded-md border p-3 text-sm space-y-1">
            <Row label={`Units × ₹${monthRate}`} value={`${units.toFixed(0)} units`} />
            <Row label="Electricity" value={formatINR(electricity)} />
            <Row label="Rent" value={formatINR(rent)} />
            <Row label="Maintenance" value={formatINR(maintenance)} />
            <Row label="Other charges" value={formatINR(other)} />
            <Row
              label={openingBalance >= 0 ? "Previous balance (advance)" : "Previous balance (due)"}
              value={`${openingBalance > 0 ? "−" : openingBalance < 0 ? "+" : ""} ${formatINR(Math.abs(openingBalance))}`}
              className={openingBalance > 0 ? "text-success" : openingBalance < 0 ? "text-destructive" : ""}
            />
            <div className="border-t pt-2 mt-2 flex justify-between font-bold">
              <span>Total Due</span>
              <span>{formatINR(totalDue)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !val}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : current ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between ${className}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
