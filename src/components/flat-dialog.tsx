import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Plus, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createTenant, deleteTenant, revealTenantPassword } from "@/lib/admin.functions";
import { DocumentVault } from "@/components/document-vault";
import { FolderLock } from "lucide-react";

interface Flat {
  id: string;
  flat_number: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_mobile: string;
  tenant_whatsapp: string;
  rent: number;
  maintenance: number;
  other_charges: number;
  prev_meter_reading: number;
  security_deposit: number;
  due_date?: number | null;
}

export function FlatDialog({
  flat,
  onSaved,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
}: {
  flat?: Flat;
  onSaved: () => void;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = controlledOnOpenChange ?? setUncontrolledOpen;
  const [flatNumber, setFlatNumber] = useState(flat?.flat_number ?? "");
  const [tenantName, setTenantName] = useState(flat?.tenant_name ?? "");
  const [tenantUsername, setTenantUsername] = useState(flat?.tenant_mobile ?? "");
  const [tenantPassword, setTenantPassword] = useState("");
  const [rent, setRent] = useState(String(flat?.rent ?? ""));
  const [maintenance, setMaintenance] = useState(String(flat?.maintenance ?? ""));
  const [other, setOther] = useState(String(flat?.other_charges ?? ""));
  const [whatsapp, setWhatsapp] = useState(flat?.tenant_whatsapp ?? "");
  const [prev, setPrev] = useState(String(flat?.prev_meter_reading ?? ""));
  const [securityDeposit, setSecurityDeposit] = useState(
    String(flat?.security_deposit ?? "")
  );
  const [dueDate, setDueDate] = useState(
    flat?.due_date != null ? String(flat.due_date) : ""
  );
  const [showPassword, setShowPassword] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [saving, setSaving] = useState(false);

  const createTenantFn = useServerFn(createTenant);
  const deleteTenantFn = useServerFn(deleteTenant);
  const revealPasswordFn = useServerFn(revealTenantPassword);

  const toggleReveal = async () => {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    // Nothing typed yet and a tenant exists -> fetch the stored password.
    if (!tenantPassword && flat?.tenant_id) {
      setRevealing(true);
      try {
        const r = await revealPasswordFn({ data: { tenantId: flat.tenant_id } });
        if (!r.ok) {
          toast.error(r.error || "Could not reveal password");
          return;
        }
        setTenantPassword(r.password);
      } catch (e) {
        toast.error((e as Error).message);
        return;
      } finally {
        setRevealing(false);
      }
    }
    setShowPassword(true);
  };

  const save = async () => {
    if (!flatNumber.trim()) return toast.error("Flat number required");
    setSaving(true);
    try {
      let flatId = flat?.id;
      const wa = whatsapp.replace(/\D/g, "");
      const dueDay = dueDate.trim() === "" ? null : Math.min(31, Math.max(1, parseInt(dueDate, 10) || 0)) || null;
      if (flat) {
        const { error } = await supabase.from("flats").update({
          flat_number: flatNumber,
          tenant_name: tenantName,
          tenant_mobile: tenantUsername.trim().toLowerCase(),
          tenant_whatsapp: wa,
          rent: Number(rent) || 0,
          maintenance: Number(maintenance) || 0,
          other_charges: Number(other) || 0,
          prev_meter_reading: Number(prev) || 0,
          security_deposit: Number(securityDeposit) || 0,
          due_date: dueDay,
        }).eq("id", flat.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("flats").insert({
          flat_number: flatNumber,
          tenant_name: tenantName,
          tenant_mobile: tenantUsername.trim().toLowerCase(),
          tenant_whatsapp: wa,
          rent: Number(rent) || 0,
          maintenance: Number(maintenance) || 0,
          other_charges: Number(other) || 0,
          prev_meter_reading: Number(prev) || 0,
          security_deposit: Number(securityDeposit) || 0,
          due_date: dueDay,
        }).select().single();
        if (error) throw error;
        flatId = data.id;
      }

      if (flatId && tenantUsername && tenantPassword) {
        const r = await createTenantFn({
          data: {
            flatId,
            username: tenantUsername,
            password: tenantPassword,
            name: tenantName || `Flat ${flatNumber}`,
          },
        });
        if (!r.ok) throw new Error(r.error || "Failed to create tenant login");
      }

      toast.success(flat ? "Flat updated" : "Flat added");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!flat) return;
    const sd = Number(flat.security_deposit ?? 0);
    const q = sd > 0
      ? `Security deposit of ₹${sd} returned and all dues clear?`
      : "All dues clear?";
    if (!confirm(q)) return;
    if (!confirm(`Permanently delete flat ${flat.flat_number} and all its readings?`)) return;
    if (flat.tenant_id && confirm("Also delete tenant login account?")) {
      await deleteTenantFn({ data: { tenantId: flat.tenant_id } });
    }
    const { error } = await supabase.from("flats").delete().eq("id", flat.id);
    if (error) toast.error(error.message);
    else { toast.success("Flat deleted"); setOpen(false); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          {flat ? (
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Flat
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {flat ? `Edit Flat ${flat.flat_number}` : "Add New Flat"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Flat Number *</Label>
            <Input
              value={flatNumber}
              onChange={(e) => setFlatNumber(e.target.value)}
              placeholder="A-101"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tenant Name</Label>
              <Input
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
              />
            </div>
            <div>
              <Label>Tenant Username</Label>
              <Input
                value={tenantUsername}
                onChange={(e) => setTenantUsername(e.target.value)}
                placeholder="e.g. raj_a101"
                autoCapitalize="none"
              />
            </div>
          </div>
          <div>
            <Label>
              Tenant Password{" "}
              {flat?.tenant_id && (
                <span className="text-xs text-muted-foreground">
                  (tap the eye to view, or type a new one)
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                value={tenantPassword}
                onChange={(e) => setTenantPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder={flat?.tenant_id ? "••••••••" : "Set login password"}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                onClick={toggleReveal}
                disabled={revealing}
                tabIndex={-1}
              >
                {revealing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {flat?.tenant_id && (
              <p className="text-xs text-muted-foreground mt-1">
                Passwords set from here are stored encrypted, so you can view them again. Older
                passwords set before this change can't be shown — reset one to enable viewing.
              </p>
            )}
          </div>
          <div>
            <Label>WhatsApp Mobile (10 digits, no +91)</Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="9876543210"
              inputMode="numeric"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Rent (₹)</Label>
              <Input
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                type="number"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Maintenance (₹)</Label>
              <Input
                value={maintenance}
                onChange={(e) => setMaintenance(e.target.value)}
                type="number"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Other (₹)</Label>
              <Input
                value={other}
                onChange={(e) => setOther(e.target.value)}
                type="number"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Previous Meter Reading</Label>
              <Input
                value={prev}
                onChange={(e) => setPrev(e.target.value)}
                type="number"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Security Deposit (₹)</Label>
              <Input
                value={securityDeposit}
                onChange={(e) => setSecurityDeposit(e.target.value)}
                type="number"
                inputMode="numeric"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <Label>Due Date (day of month)</Label>
            <Input
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              step={1}
              placeholder="e.g. 10"
            />
          </div>

          {flat?.tenant_id && (
            <div className="pt-2 border-t">
              <DocumentVault
                tenantId={flat.tenant_id}
                tenantName={flat.tenant_name || `Flat ${flat.flat_number}`}
                trigger={
                  <Button variant="outline" className="w-full">
                    <FolderLock className="h-4 w-4 mr-1" /> Document Vault
                  </Button>
                }
              />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {flat && (
            <Button variant="destructive" onClick={remove} className="mr-auto">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
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
