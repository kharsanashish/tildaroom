import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface FlatLite {
  id: string;
  flat_number: string;
  rent: number;
  other_charges: number;
  last_reviewed_year: number | null;
}

export function JanuaryReview({ onDone }: { onDone: () => void }) {
  const now = new Date();
  const isJanuary = now.getMonth() === 0;
  const year = now.getFullYear();

  const [queue, setQueue] = useState<FlatLite[]>([]);
  const [open, setOpen] = useState(false);
  const [rent, setRent] = useState("");
  const [other, setOther] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isJanuary) return;
    (async () => {
      const { data } = await supabase
        .from("flats")
        .select("id, flat_number, rent, other_charges, last_reviewed_year")
        .or(`last_reviewed_year.is.null,last_reviewed_year.lt.${year}`)
        .order("flat_number");
      if (data && data.length) {
        setQueue(data as FlatLite[]);
        setOpen(true);
      }
    })();
  }, [isJanuary, year]);

  const current = queue[0];
  useMemo(() => {
    if (current) {
      setRent(String(current.rent ?? ""));
      setOther(String(current.other_charges ?? ""));
    }
  }, [current?.id]);

  if (!current) return null;

  const advance = (newQueue: FlatLite[]) => {
    if (newQueue.length === 0) {
      setOpen(false);
      onDone();
    }
    setQueue(newQueue);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("flats")
      .update({
        rent: Number(rent) || 0,
        other_charges: Number(other) || 0,
        last_reviewed_year: year,
      })
      .eq("id", current.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Flat ${current.flat_number} updated`);
    advance(queue.slice(1));
  };

  const skip = () => advance(queue.slice(1));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>January {year} review — Flat {current.flat_number}</DialogTitle>
          <DialogDescription>
            Update monthly rent and other charges for this year ({queue.length} flat{queue.length > 1 ? "s" : ""} left).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Monthly Rent (₹)</Label>
            <Input value={rent} onChange={(e) => setRent(e.target.value)} type="number" inputMode="numeric" />
          </div>
          <div>
            <Label>Other Charges (₹)</Label>
            <Input value={other} onChange={(e) => setOther(e.target.value)} type="number" inputMode="numeric" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={skip}>Skip</Button>
          <Button onClick={save} disabled={saving}>Save & Next</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
