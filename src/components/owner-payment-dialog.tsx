import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IndianRupee, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { balanceDue, currentMonthYear, formatINR, monthLabel, roundBillAmount } from "@/lib/billing";

interface Flat {
  id: string;
  flat_number: string;
  tenant_id: string | null;
  rent: number;
  maintenance: number;
  other_charges: number;
  prev_meter_reading: number;
}

interface ReadingLike {
  id: string;
  flat_id: string;
  month: number;
  year: number;
  prev_reading: number;
  curr_reading: number | null;
  total_due: number;
  amount_paid: number;
}

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

export function OwnerPaymentDialog({
  flat, reading, allReadings, onSaved, trigger,
}: {
  flat: Flat;
  reading?: ReadingLike;
  allReadings: ReadingLike[];
  onSaved: () => void;
  trigger: React.ReactNode;
}) {
  const { month, year } = currentMonthYear();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const outstanding = reading
    ? balanceDue(Number(reading.total_due), Number(reading.amount_paid))
    : roundBillAmount(Number(flat.rent) + Number(flat.maintenance ?? 0) + Number(flat.other_charges));

  // Create the month row if it doesn't exist yet, so payments recorded before
  // the meter reading is entered are still attached to this month.
  const ensureRow = async (): Promise<string | null> => {
    if (reading) return reading.id;
    const prev = [...allReadings]
      .filter((r) => r.flat_id === flat.id && !(r.month === month && r.year === year))
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    const prevReading = prev?.curr_reading != null
      ? Number(prev.curr_reading)
      : Number(flat.prev_meter_reading ?? 0);
    const openingBalance = prev
      ? Number(prev.amount_paid) - roundBillAmount(Number(prev.total_due))
      : 0;
    const rent = Number(flat.rent ?? 0);
    const maintenance = Number(flat.maintenance ?? 0);
    const other = Number(flat.other_charges ?? 0);
    const { data, error } = await supabase
      .from("meter_readings")
      .insert({
        flat_id: flat.id, month, year,
        prev_reading: prevReading, curr_reading: null,
        units: 0, rate_per_unit: 0, electricity_bill: 0,
        rent, maintenance, other_charges: other,
        opening_balance: openingBalance,
        total_due: roundBillAmount(rent + maintenance + other - openingBalance),
        amount_paid: 0,
        payment_status: "pending",
        source: "owner",
      })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return null; }
    return data.id as string;
  };

  const save = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    const readingId = await ensureRow();
    if (!readingId) { setSaving(false); return; }
    // Owner-entered payments are approved immediately.
    const { error } = await supabase.from("payments").insert({
      reading_id: readingId,
      flat_id: flat.id,
      tenant_id: flat.tenant_id,
      amount: amt,
      method,
      note: note || null,
      status: "approved",
      approved_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${formatINR(amt)} recorded and approved`);
    setAmount(""); setNote("");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <IndianRupee className="h-4 w-4 text-success" />
            Add Payment • Flat {flat.flat_number}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">{monthLabel(month, year)} outstanding</span>
            <span className="font-semibold">{formatINR(outstanding)}</span>
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input
              type="number" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0"
            />
            {outstanding > 0 && (
              <Button
                type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs"
                onClick={() => setAmount(String(Math.round(outstanding)))}
              >
                Use full outstanding
              </Button>
            )}
          </div>
          <div>
            <Label className="text-xs">Payment mode</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {METHODS.map((m) => (
                <Button
                  key={m.value} type="button" size="sm"
                  variant={method === m.value ? "default" : "outline"}
                  onClick={() => setMethod(m.value)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid in person" />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="w-full sm:w-auto" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
