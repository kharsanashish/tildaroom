import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatINR, roundBillAmount, type PaymentStatus } from "@/lib/billing";

interface Reading {
  id: string;
  prev_reading: number; curr_reading: number | null;
  units: number; rate_per_unit: number; electricity_bill: number;
  rent: number; maintenance: number; other_charges: number; opening_balance: number;
  total_due: number; amount_paid: number; payment_status: PaymentStatus;
}

export function EditReadingDialog({ reading, open, onOpenChange, onSaved }: {
  reading: Reading; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  // Editable: Current Reading and Other Charges only.
  // Paid Amount + Status are now derived from the `payments` table — never edited here.
  const [currReading, setCurrReading] = useState<string>(
    reading.curr_reading == null ? "" : String(reading.curr_reading),
  );
  const [otherCharges, setOtherCharges] = useState<string>(String(reading.other_charges ?? 0));
  const [saving, setSaving] = useState(false);

  const prevReading = Number(reading.prev_reading) || 0;
  const ratePerUnit = Number(reading.rate_per_unit) || 0;
  const rent = Number(reading.rent) || 0;
  const maintenance = Number(reading.maintenance) || 0;
  const openingBalance = Number(reading.opening_balance) || 0;

  const { units, electricity, totalDue } = useMemo(() => {
    const curr = currReading === "" ? 0 : Number(currReading);
    const u = Math.max(0, curr - prevReading);
    const e = u * ratePerUnit;
    const oc = Number(otherCharges) || 0;
    return {
      units: u,
      electricity: e,
      totalDue: roundBillAmount(rent + maintenance + oc + e - openingBalance),
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
          Paid amount and status come from the Payments table — approve or reject individual installments from the Approvals tab.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Locked label="Prev Reading" value={String(prevReading)} />
          <div>
            <Label className="text-xs">Current Reading</Label>
            <Input type="number" value={currReading} onChange={(e) => setCurrReading(e.target.value)} />
          </div>
          <Locked label="Units" value={units.toFixed(0)} />
          <Locked label="Rate / Unit" value={`₹${ratePerUnit}`} />
          <Locked label="Electricity Bill" value={formatINR(electricity)} />
          <Locked label="Rent" value={formatINR(rent)} />
          <Locked label="Maintenance" value={formatINR(maintenance)} />
          <div>
            <Label className="text-xs">Other Charges</Label>
            <Input type="number" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} />
          </div>
          <Locked label="Opening Balance" value={formatINR(openingBalance)} />
          <Locked label="Total Due" value={formatINR(totalDue)} />
          <Locked label="Paid (approved)" value={formatINR(Number(reading.amount_paid))} />
          <Locked label="Status" value={reading.payment_status} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
