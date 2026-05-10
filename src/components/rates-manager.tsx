import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MONTH_NAMES, currentMonthYear } from "@/lib/billing";

interface Rate { id?: string; month: number; year: number; rate_per_unit: number; }

export function RatesManager({ onChange }: { onChange?: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [bill, setBill] = useState("");
  const [units, setUnits] = useState("");
  const [applying, setApplying] = useState(false);

  const { month: cm, year: cy } = currentMonthYear();

  const last12 = useMemo(() => {
    const out: { month: number; year: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(cy, cm - 1 - i, 1);
      out.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }
    return out;
  }, [cm, cy]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("electricity_rates").select("*");
    const existing = (data ?? []) as Rate[];
    const merged = last12.map((p) => {
      const e = existing.find((r) => r.month === p.month && r.year === p.year);
      return e ?? { month: p.month, year: p.year, rate_per_unit: 0 };
    });
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const updateRow = (i: number, val: string) => {
    setRows((p) => p.map((r, idx) => idx === i ? { ...r, rate_per_unit: Number(val) || 0 } : r));
  };

  const saveRow = async (i: number) => {
    const r = rows[i];
    const key = `${r.year}-${r.month}`;
    setSavingKey(key);
    const { error } = await supabase.from("electricity_rates").upsert(
      { month: r.month, year: r.year, rate_per_unit: r.rate_per_unit },
      { onConflict: "month,year" },
    );
    setSavingKey(null);
    if (error) return toast.error(error.message);
    toast.success(`Saved ${MONTH_NAMES[r.month - 1]} ${r.year}`);
    onChange?.();
    load();
  };

  const suggested = useMemo(() => {
    const b = Number(bill), u = Number(units);
    if (!b || !u) return 0;
    return Math.round((b / u) * 100) / 100;
  }, [bill, units]);

  const apply = async () => {
    if (!suggested) return;
    setApplying(true);
    const { error } = await supabase.from("electricity_rates").upsert(
      { month: cm, year: cy, rate_per_unit: suggested },
      { onConflict: "month,year" },
    );
    setApplying(false);
    if (error) return toast.error(error.message);
    toast.success(`Set ${MONTH_NAMES[cm - 1]} ${cy} rate to ₹${suggested}`);
    setBill(""); setUnits("");
    onChange?.();
    load();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><History className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Electricity Rates</DialogTitle></DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const key = `${r.year}-${r.month}`;
              const isCurrent = r.month === cm && r.year === cy;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="flex-1 text-sm">
                    {MONTH_NAMES[r.month - 1]} {r.year}
                    {isCurrent && <span className="ml-2 text-xs text-primary">(current)</span>}
                  </div>
                  <Input
                    type="number" inputMode="decimal"
                    className="w-28"
                    value={r.rate_per_unit || ""}
                    onChange={(e) => updateRow(i, e.target.value)}
                    placeholder="₹/unit"
                  />
                  <Button size="sm" onClick={() => saveRow(i)} disabled={savingKey === key}>
                    {savingKey === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <Card className="p-3 mt-4 space-y-3 bg-muted/40">
          <div className="text-sm font-semibold">Rate Calculator</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Total Bill (₹)</Label>
              <Input type="number" inputMode="decimal" value={bill} onChange={(e) => setBill(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Total Units</Label>
              <Input type="number" inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              Suggested: <span className="font-semibold">₹{suggested || "—"} / unit</span>
            </div>
            <Button size="sm" onClick={apply} disabled={!suggested || applying}>
              {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : `Apply to ${MONTH_NAMES[cm - 1]}`}
            </Button>
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
