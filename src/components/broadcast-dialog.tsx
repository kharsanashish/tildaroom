import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Bell, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { sendPush } from "@/lib/push";

interface Flat {
  id: string;
  flat_number: string;
  tenant_name: string;
  tenant_id: string | null;
}

export function BroadcastDialog({ flats }: { flats: Flat[] }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const tenants = flats.filter((f) => f.tenant_id);

  const send = async () => {
    if (!message.trim()) return toast.error("Please enter a message.");
    if (tenants.length === 0) return toast.error("No tenants with accounts found.");
    setSending(true);
    let sent = 0;
    let failed = 0;
    for (const f of tenants) {
      if (!f.tenant_id) continue;
      const result = await sendPush({
        toUserId: f.tenant_id,
        title: "Message from Owner 🏠",
        body: message.trim(),
        url: "/tenant",
        tag: "broadcast",
      });
      if (result.ok) sent++;
      else failed++;
    }
    setSending(false);
    if (sent > 0) toast.success(`Message sent to ${sent} tenant${sent !== 1 ? "s" : ""}.`);
    if (failed > 0) toast.error(`${failed} tenant${failed !== 1 ? "s" : ""} have not enabled notifications yet.`);
    setMessage("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Send notification to all tenants">
          <Bell className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Send Notification to All Tenants</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Will be sent to{" "}
            <span className="font-semibold text-foreground">{tenants.length}</span>{" "}
            tenant{tenants.length !== 1 ? "s" : ""}
            {tenants.length > 0 && (
              <span className="text-xs ml-1">
                ({tenants.map((f) => `Flat ${f.flat_number}`).join(", ")})
              </span>
            )}
          </div>
          <div>
            <Label className="text-xs mb-1 block">Your message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Please submit your meter reading by 5th of this month."
              rows={4}
              className="resize-none"
            />
            <div className="text-xs text-muted-foreground mt-1 text-right">
              {message.length}/200
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={send}
            disabled={sending || !message.trim() || tenants.length === 0}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Send to All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
