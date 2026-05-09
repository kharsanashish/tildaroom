import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PaymentStatus } from "@/lib/billing";

interface Reading {
  id: string;
  prev_reading: number; curr_reading: number | null;
  units: number; rate_per_unit: number; electricity_bill: number;
  rent: number; other_charges: number; opening_balance: number;
  total_due: number; amount_paid: number; payment_status: PaymentStatus;
}

const STATUSES: PaymentStatus[] = ["pending_approval", "paid", "rejected", "partial"];

export function EditReadingDialog({ reading, open, onOpenChange, onSaved }: {
  reading: Reading; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [s, setS] = useState({ ...reading });
  const [saving, setSaving] = useState(false);

  const update = (k: keyof Reading, v: string) => {
    setS((p) => ({ ...p, [k]: k === "payment_status" ? (v as PaymentStatus) : Number(v) }));
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("meter_readings").update({
      prev_reading: Number(s.prev_reading) || 0,
      curr_reading: s.curr_reading == null ? null : Number(s.curr_reading),
      units: Number(s.units) || 0,
      rate_per_unit: Number(s.rate_per_unit) || 0,
      electricity_bill: Number(s.electricity_bill) || 0,
      rent: Number(s.rent) || 0,
      other_charges: Number(s.other_charges) || 0,
      opening_balance: Number(s.opening_balance) || 0,
      total_due: Number(s.total_due) || 0,
      amount_paid: Number(s.amount_paid) || 0,
      payment_status: s.payment_status,
    }).eq("id", reading.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Reading updated");
    onSaved();
    onOpenChange(false);
  };

  const F = ({ label, k }: { label: string; k: keyof Reading }) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={String((s as any)[k] ?? "")} onChange={(e) => update(k, e.target.value)} type="number" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Reading</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <F label="Prev Reading" k="prev_reading" />
          <F label="Curr Reading" k="curr_reading" />
          <F label="Units" k="units" />
          <F label="Rate / Unit" k="rate_per_unit" />
          <F label="Electricity Bill" k="electricity_bill" />
          <F label="Rent" k="rent" />
          <F label="Other Charges" k="other_charges" />
          <F label="Opening Balance" k="opening_balance" />
          <F label="Total Due" k="total_due" />
          <F label="Amount Paid" k="amount_paid" />
          <div className="col-span-2">
            <Label className="text-xs">Status</Label>
            <select
              value={s.payment_status}
              onChange={(e) => update("payment_status", e.target.value)}
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
