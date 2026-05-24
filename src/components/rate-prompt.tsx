import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentMonthYear, monthLabel } from "@/lib/billing";
import { toast } from "sonner";

const skipKey = (m: number, y: number) => `rate-skip-${y}-${m}`;

export function RatePrompt() {
  const { month, year } = currentMonthYear();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("electricity_rates")
        .select("id")
        .eq("month", month).eq("year", year).maybeSingle();
      if (!data) setOpen(true);
    })();
  }, [month, year]);

  const save = async () => {
    const v = Number(rate);
    if (!v || v <= 0) return toast.error("Enter a valid rate");
    setSaving(true);
    const { error } = await supabase
      .from("electricity_rates")
      .insert({ month, year, rate_per_unit: v });
    setSaving(false);
    if (error) return toast.error(error.message);
    sessionStorage.removeItem(skipKey(month, year));
    toast.success(`Rate set for ${monthLabel(month, year)}`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set electricity rate for {monthLabel(month, year)}</DialogTitle>
          <DialogDescription>This rate will be used for this month's electricity bills.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Rate per unit (₹)</Label>
          <Input value={rate} onChange={(e) => setRate(e.target.value)} type="number" inputMode="decimal" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Skip</Button>
          <Button onClick={save} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
