import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatINR } from "@/lib/billing";

interface Settings {
  owner_upi_id: string;
  owner_name: string;
  owner_mobile: string;
}

export function SettingsDialog({
  settings,
  onSaved,
  currentRate,
}: {
  settings: Settings;
  onSaved: () => void;
  currentRate?: number;
}) {
  const [open, setOpen] = useState(false);
  const [upi, setUpi] = useState(settings?.owner_upi_id ?? "");
  const [name, setName] = useState(settings?.owner_name ?? "");
  const [mobile, setMobile] = useState(settings?.owner_mobile ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("settings").update({
      owner_upi_id: upi.trim(),
      owner_name: name.trim(),
      owner_mobile: mobile.replace(/\D/g, ""),
    }).eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Settings saved"); setOpen(false); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Settings">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Current electricity rate — read-only info */}
          {currentRate !== undefined && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-warning flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">
                  Current month electricity rate
                </div>
                <div className="font-semibold text-sm">
                  {currentRate > 0
                    ? `${formatINR(currentRate)} / unit`
                    : "Not set for this month"}
                </div>
              </div>
            </div>
          )}
          <div>
            <Label>Owner Name (shown on UPI)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>WhatsApp Mobile (10 digits, no +91)</Label>
            <Input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="9876543210"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label>PhonePe UPI ID</Label>
            <Input
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
              placeholder="name@ybl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
