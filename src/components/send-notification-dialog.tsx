import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { sendPush } from "@/lib/push";

interface Flat {
  id: string;
  flat_number: string;
  tenant_name: string;
  tenant_id: string | null;
  is_vacant?: boolean;
}

export function SendNotificationDialog({ flats }: { flats: Flat[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Only tenants with a registered user account and non-vacant flats
  const tenants = flats.filter((f) => f.tenant_id && !f.is_vacant);

  const send = async () => {
    if (!message.trim()) { toast.error("Please enter a message."); return; }
    if (!tenants.length) { toast.error("No active tenants to notify."); return; }
    setSending(true);
    let sent = 0;
    for (const f of tenants) {
      if (!f.tenant_id) continue;
      await sendPush({
        toUserId: f.tenant_id,
        title: title.trim() || "Notice from Owner",
        body: message.trim(),
        url: "/tenant",
        tag: "owner-notice",
      });
      sent++;
    }
    setSending(false);
    toast.success(`Notification sent to ${sent} tenant${sent !== 1 ? "s" : ""}`);
    setTitle("");
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
          <DialogTitle>Send Notification</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Will send to{" "}
            <span className="font-semibold text-foreground">{tenants.length}</span>{" "}
            active tenant{tenants.length !== 1 ? "s" : ""}
            {tenants.length > 0 && (
              <span className="text-muted-foreground">
                {" "}({tenants.map((f) => `Flat ${f.flat_number}`).join(", ")})
              </span>
            )}
          </div>

          <div>
            <Label className="text-xs">Title (optional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notice from Owner"
              maxLength={60}
            />
          </div>

          <div>
            <Label className="text-xs">Message *</Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              rows={4}
              maxLength={300}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            <div className="text-[10px] text-muted-foreground text-right mt-1">
              {message.length}/300
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending || !message.trim() || !tenants.length}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1" />
            )}
            Send to All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
