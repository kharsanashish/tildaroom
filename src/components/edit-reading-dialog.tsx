import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatINR, type PaymentStatus } from "@/lib/billing";

interface Reading {
  id: string;
  prev_reading: number; curr_reading: number | null;
  units: number; rate_per_unit: number; electricity_bill: number;
  rent: number; maintenance: number; other_charges: number; opening_balance: number;
  total_due: number; amount_paid: number; payment_status: PaymentStatus;
}

const STATUSES: PaymentStatus[] = ["pending", "pending_approval", "paid", "rejected", "partial"];

export function EditReadingDialog({ reading, open, onOpenChange, onSaved }: {
  reading: Reading; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  // Only 3 editable fields; rest are auto-populated read-only from existing reading
  const [currReading, setCurrReading] = useState<string>(
    reading.curr_reading == null ? "" : String(reading.curr_reading),
  );
  const [otherCharges, setOtherCharges] = useState<string>(String(reading.other_charges ?? 0));
  const [amountPaid, setAmountPaid] = useState<string>(String(reading.amount_paid ?? 0));
  const [status, setStatus] = useState<PaymentStatus>(reading.payment_status);
  const [saving, setSaving] = useState(false);

  // Locked values (from latest existing record)
  const prevReading = Number(reading.prev_reading) || 0;
  const ratePerUnit = Number(reading.rate_per_unit) || 0;
  const rent = Number(reading.rent) || 0;
  const maintenance = Number(reading.maintenance) || 0;
  const openingBalance = Number(reading.opening_balance) || 0;

  // Derived (recomputed from editable curr_reading + other_charges)
  const { units, electricity, totalDue } = useMemo(() => {
    const curr = currReading === "" ? 0 : Number(currReading);
    const u = Math.max(0, curr - prevReading);
    const e = u * ratePerUnit;
    const oc = Number(otherCharges) || 0;
    return {
      units: u,
      electricity: e,
      totalDue: rent + maintenance + oc + e - openingBalance,
    };
  }, [currReading, otherCharges, prevReading, ratePerUnit, rent, maintenance, openingBalance]);

  const save = async () => {
    setSaving(true);
    const curr = currReading === "" ? null : Number(currReading);
    const { error } = await supabase.from("meter_readings").update({
      curr_reading: curr,
      units,
      electricity_bill: electricity,
      other_charges: Number(otherCharges) || 0,
      total_due: totalDue,
      amount_paid: Number(amountPaid) || 0,
      payment_status: status,
    }).eq("id", reading.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Reading updated");
    onSaved();
    onOpenChange(false);
  };

  const Locked = ({ label, value }: { label: string; value: string }) => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="h-9 px-3 flex items-center rounded-md border bg-muted text-sm">{value}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Reading</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Only Current Reading, Other Charges, and Paid Amount can be edited. Other values are auto-populated.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Locked label="Prev Reading" value={String(prevReading)} />
          <div>
            <Label className="text-xs">Current Reading</Label>
            <Input
              type="number"
              value={currReading}
              onChange={(e) => setCurrReading(e.target.value)}
            />
          </div>
          <Locked label="Units" value={units.toFixed(0)} />
          <Locked label="Rate / Unit" value={`₹${ratePerUnit}`} />
          <Locked label="Electricity Bill" value={formatINR(electricity)} />
          <Locked label="Rent" value={formatINR(rent)} />
          <Locked label="Maintenance" value={formatINR(maintenance)} />
          <div>
            <Label className="text-xs">Other Charges</Label>
            <Input
              type="number"
              value={otherCharges}
              onChange={(e) => setOtherCharges(e.target.value)}
            />
          </div>
          <Locked label="Opening Balance" value={formatINR(openingBalance)} />
          <Locked label="Total Due" value={formatINR(totalDue)} />
          <div>
            <Label className="text-xs">Paid Amount</Label>
            <Input
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PaymentStatus)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
