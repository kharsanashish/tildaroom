import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RouteGuard } from "@/components/route-guard";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, LogOut, Plus, Settings as SettingsIcon, Pencil, Trash2, IndianRupee, History, CheckCircle2, XCircle, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createTenant, deleteTenant } from "@/lib/admin.functions";
import { currentMonthYear, formatINR, monthLabel, statusColor, statusLabel, type PaymentStatus } from "@/lib/billing";
import { getRateFor } from "@/lib/rates";
import { RatePrompt } from "@/components/rate-prompt";
import { JanuaryReview } from "@/components/january-review";
import { EditReadingDialog } from "@/components/edit-reading-dialog";
import { OwnerReadingDialog } from "@/components/owner-reading-dialog";
import { RatesManager } from "@/components/rates-manager";

export const Route = createFileRoute("/owner")({
  component: () => (
    <RouteGuard require="owner">
      <OwnerDashboard />
    </RouteGuard>
  ),
});

interface Flat {
  id: string;
  flat_number: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_mobile: string;
  rent: number;
  other_charges: number;
  prev_meter_reading: number;
}
interface Reading {
  id: string;
  flat_id: string;
  month: number;
  year: number;
  prev_reading: number;
  curr_reading: number | null;
  units: number;
  rate_per_unit: number;
  electricity_bill: number;
  rent: number;
  other_charges: number;
  opening_balance: number;
  total_due: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_timestamp: string | null;
}
interface Settings {
  electricity_rate_per_unit: number;
  owner_upi_id: string;
  owner_name: string;
  owner_mobile: string;
}

function OwnerDashboard() {
  const { signOut } = useAuth();
  const [flats, setFlats] = useState<Flat[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [monthRate, setMonthRate] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const { month, year } = currentMonthYear();

  const refresh = async () => {
    const [{ data: f }, { data: r }, { data: s }] = await Promise.all([
      supabase.from("flats").select("*").order("flat_number"),
      supabase.from("meter_readings").select("*"),
      supabase.from("settings").select("*").eq("id", 1).single(),
    ]);
    setFlats((f as Flat[]) ?? []);
    setReadings((r as Reading[]) ?? []);
    setSettings(s as Settings);
    const fallback = Number((s as Settings)?.electricity_rate_per_unit ?? 0);
    setMonthRate(await getRateFor(month, year, fallback));
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  
  const currentReadings = useMemo(
    () => readings.filter((r) => r.month === month && r.year === year),
    [readings, month, year],
  );

  const stats = useMemo(() => {
    let expected = 0, collected = 0, pending = 0;
    for (const f of flats) {
      const r = currentReadings.find((x) => x.flat_id === f.id);
      if (r) {
        expected += Number(r.total_due);
        const approved = r.payment_status === "paid" || r.payment_status === "partial";
        if (approved) {
          collected += Number(r.amount_paid);
          pending += Math.max(0, Number(r.total_due) - Number(r.amount_paid));
        } else {
          // pending, pending_approval, rejected → not yet collected
          pending += Number(r.total_due);
        }
      } else {
        expected += Number(f.rent) + Number(f.other_charges);
        pending += Number(f.rent) + Number(f.other_charges);
      }
    }
    return { expected, collected, pending };
  }, [flats, currentReadings]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm">Owner Dashboard</div>
              <div className="text-xs text-muted-foreground">{monthLabel(month, year)}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <RatesManager onChange={refresh} />
            <SettingsDialog settings={settings!} onSaved={refresh} />
            <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Expected" value={stats.expected} variant="info" />
          <StatCard label="Collected" value={stats.collected} variant="success" />
          <StatCard label="Pending" value={stats.pending} variant="warning" />
        </div>

        <Tabs defaultValue="flats">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="flats">Flats</TabsTrigger>
            <TabsTrigger value="approvals">
              Approvals
              {readings.filter((r) => r.payment_status === "pending_approval").length > 0 && (
                <Badge className="ml-2 bg-warning text-warning-foreground h-5">
                  {readings.filter((r) => r.payment_status === "pending_approval").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="flats" className="space-y-3 mt-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Your Flats ({flats.length})</h2>
              <FlatDialog onSaved={refresh} />
            </div>
            {flats.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                No flats yet. Click "Add Flat" to create one.
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {flats.map((f) => (
                  <FlatCard
                    key={f.id}
                    flat={f}
                    reading={currentReadings.find((r) => r.flat_id === f.id)}
                    allReadings={readings}
                    monthRate={monthRate}
                    onChange={refresh}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="approvals" className="mt-4">
            <ApprovalsList flats={flats} readings={readings} onChange={refresh} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <HistoryView flats={flats} readings={readings} onChange={refresh} />
          </TabsContent>
        </Tabs>
      </main>

      {settings && <RatePrompt defaultRate={settings.electricity_rate_per_unit} />}
      <JanuaryReview onDone={refresh} />
    </div>
  );
}

function StatCard({ label, value, variant }: { label: string; value: number; variant: "info" | "success" | "warning" }) {
  const bg =
    variant === "success" ? "bg-success/10 text-success-foreground border-success/30"
    : variant === "warning" ? "bg-warning/15 text-warning-foreground border-warning/40"
    : "bg-info/10 text-info-foreground border-info/30";
  return (
    <Card className={`p-3 sm:p-4 border ${bg}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg sm:text-2xl font-bold mt-1">{formatINR(value)}</div>
    </Card>
  );
}

function FlatCard({ flat, reading, allReadings, monthRate, onChange }: {
  flat: Flat; reading?: Reading; allReadings: Reading[]; monthRate: number; onChange: () => void;
}) {
  const status: PaymentStatus = reading?.payment_status ?? "pending";
  const due = reading ? Number(reading.total_due) - Number(reading.amount_paid) : Number(flat.rent) + Number(flat.other_charges);
  const balance = reading ? -(Number(reading.total_due) - Number(reading.amount_paid)) : 0;
  const flatReadings = allReadings.filter((r) => r.flat_id === flat.id);
  const canEditReading = status !== "paid" && status !== "pending_approval";

  return (
    <Card className="p-4 hover:shadow-md transition-shadow" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Flat {flat.flat_number}</h3>
            <Badge className={statusColor(status)}>{statusLabel(status)}</Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {flat.tenant_name || "(no tenant)"} {flat.tenant_mobile && `• ${flat.tenant_mobile}`}
          </div>
        </div>
        <FlatDialog flat={flat} onSaved={onChange} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Rent</div>
          <div className="font-medium">{formatINR(Number(flat.rent))}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Other</div>
          <div className="font-medium">{formatINR(Number(flat.other_charges))}</div>
        </div>
        {reading ? (
          <>
            <div>
              <div className="text-xs text-muted-foreground">Units</div>
              <div className="font-medium">{Number(reading.units).toFixed(0)} units</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bill</div>
              <div className="font-medium">{formatINR(Number(reading.electricity_bill))}</div>
            </div>
          </>
        ) : (
          <div className="col-span-2 text-xs text-muted-foreground italic">
            No reading for this month yet
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">{status === "paid" ? "Paid" : "Due"}</div>
          <div className="text-lg font-bold">{formatINR(reading ? Number(reading.total_due) : due)}</div>
          {balance < 0 && (
            <div className="text-xs text-destructive">Balance due {formatINR(-balance)}</div>
          )}
        </div>
        {canEditReading && (
          <OwnerReadingDialog
            flat={flat}
            readings={flatReadings}
            monthRate={monthRate}
            current={reading}
            onSaved={onChange}
            trigger={
              <Button size="sm" variant="outline">
                <Zap className="h-4 w-4 mr-1" />
                {reading ? "Update Reading" : "Enter Reading"}
              </Button>
            }
          />
        )}
      </div>
    </Card>
  );
}

function FlatDialog({ flat, onSaved }: { flat?: Flat; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [flatNumber, setFlatNumber] = useState(flat?.flat_number ?? "");
  const [tenantName, setTenantName] = useState(flat?.tenant_name ?? "");
  const [tenantUsername, setTenantUsername] = useState(flat?.tenant_mobile ?? "");
  const [tenantPassword, setTenantPassword] = useState("");
  const [rent, setRent] = useState(String(flat?.rent ?? ""));
  const [other, setOther] = useState(String(flat?.other_charges ?? ""));
  const [prev, setPrev] = useState(String(flat?.prev_meter_reading ?? ""));
  const [saving, setSaving] = useState(false);

  const createTenantFn = useServerFn(createTenant);
  const deleteTenantFn = useServerFn(deleteTenant);

  const save = async () => {
    if (!flatNumber.trim()) return toast.error("Flat number required");
    setSaving(true);
    try {
      let flatId = flat?.id;
      if (flat) {
        const { error } = await supabase.from("flats").update({
          flat_number: flatNumber,
          tenant_name: tenantName,
          tenant_mobile: tenantUsername.trim().toLowerCase(),
          rent: Number(rent) || 0,
          other_charges: Number(other) || 0,
          prev_meter_reading: Number(prev) || 0,
        }).eq("id", flat.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("flats").insert({
          flat_number: flatNumber,
          tenant_name: tenantName,
          tenant_mobile: tenantUsername.trim().toLowerCase(),
          rent: Number(rent) || 0,
          other_charges: Number(other) || 0,
          prev_meter_reading: Number(prev) || 0,
        }).select().single();
        if (error) throw error;
        flatId = data.id;
      }

      // Create / update tenant login if username + password provided
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
    if (!confirm(`Delete flat ${flat.flat_number}? This removes all readings.`)) return;
    if (flat.tenant_id && confirm("Also delete tenant login account?")) {
      await deleteTenantFn({ data: { tenantId: flat.tenant_id } });
    }
    const { error } = await supabase.from("flats").delete().eq("id", flat.id);
    if (error) toast.error(error.message);
    else { toast.success("Flat deleted"); setOpen(false); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {flat ? (
          <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Flat</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{flat ? `Edit Flat ${flat.flat_number}` : "Add New Flat"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Flat Number *</Label>
            <Input value={flatNumber} onChange={(e) => setFlatNumber(e.target.value)} placeholder="A-101" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tenant Name</Label>
              <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
            </div>
            <div>
              <Label>Tenant Username</Label>
              <Input value={tenantUsername} onChange={(e) => setTenantUsername(e.target.value)} placeholder="e.g. raj_a101" autoCapitalize="none" />
            </div>
          </div>
          <div>
            <Label>Tenant Password {flat?.tenant_id && <span className="text-xs text-muted-foreground">(leave empty to keep)</span>}</Label>
            <Input value={tenantPassword} onChange={(e) => setTenantPassword(e.target.value)} type="text" placeholder={flat?.tenant_id ? "•••••" : "Set login password"} />
          </div>
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
          <div>
            <Label>Previous Meter Reading</Label>
            <Input value={prev} onChange={(e) => setPrev(e.target.value)} type="number" inputMode="numeric" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {flat && (
            <Button variant="destructive" onClick={remove} className="mr-auto">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(String(settings?.electricity_rate_per_unit ?? "8"));
  const [upi, setUpi] = useState(settings?.owner_upi_id ?? "");
  const [name, setName] = useState(settings?.owner_name ?? "");
  const [mobile, setMobile] = useState(settings?.owner_mobile ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("settings").update({
      electricity_rate_per_unit: Number(rate) || 0,
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
        <Button size="sm" variant="ghost"><SettingsIcon className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Owner Name (shown on UPI)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>WhatsApp Mobile (10 digits, no +91)</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="9876543210" inputMode="numeric" />
          </div>
          <div>
            <Label>PhonePe UPI ID</Label>
            <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@ybl" />
          </div>
          <div>
            <Label>Default Electricity Rate (₹ / unit)</Label>
            <Input value={rate} onChange={(e) => setRate(e.target.value)} type="number" inputMode="decimal" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalsList({ flats, readings, onChange }: { flats: Flat[]; readings: Reading[]; onChange: () => void }) {
  const [filter, setFilter] = useState<"all" | "upi" | "cash">("all");
  const pending = readings
    .filter((r) => r.payment_status === "pending_approval")
    .filter((r) => filter === "all" || r.payment_method === filter)
    .sort((a, b) => b.year - a.year || b.month - a.month);

  const approve = async (r: Reading) => {
    const isFull = Number(r.amount_paid) >= Number(r.total_due);
    const { error } = await supabase.from("meter_readings").update({
      payment_status: isFull ? "paid" : "partial",
      payment_timestamp: new Date().toISOString(),
    }).eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success(isFull ? "Approved as paid" : "Approved as partial"); onChange(); }
  };
  const reject = async (r: Reading) => {
    const { error } = await supabase.from("meter_readings").update({
      payment_status: "rejected",
      amount_paid: 0,
    }).eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Rejected"); onChange(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
        <Button size="sm" variant={filter === "upi" ? "default" : "outline"} onClick={() => setFilter("upi")}>UPI</Button>
        <Button size="sm" variant={filter === "cash" ? "default" : "outline"} onClick={() => setFilter("cash")}>Cash</Button>
      </div>
      {pending.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">No pending approvals</Card>
      ) : (
        <div className="space-y-2">
          {pending.map((r) => {
            const flat = flats.find((f) => f.id === r.flat_id);
            const isPartial = Number(r.amount_paid) < Number(r.total_due);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">Flat {flat?.flat_number} • {flat?.tenant_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{monthLabel(r.month, r.year)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="capitalize">{r.payment_method || "upi"}</Badge>
                      {isPartial && <Badge className="bg-warning text-warning-foreground">Partial</Badge>}
                    </div>
                    <div className="text-base font-semibold mt-1">
                      {formatINR(Number(r.amount_paid))}
                      <span className="text-xs text-muted-foreground ml-1">of {formatINR(Number(r.total_due))}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => reject(r)}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button size="sm" onClick={() => approve(r)} style={{ background: "var(--success)", color: "var(--success-foreground)" }}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HistoryView({ flats, readings, onChange }: { flats: Flat[]; readings: Reading[]; onChange: () => void }) {
  const [flatId, setFlatId] = useState<string | "all">("all");
  const [editing, setEditing] = useState<Reading | null>(null);
  const filtered = readings
    .filter((r) => flatId === "all" || r.flat_id === flatId)
    .sort((a, b) => b.year - a.year || b.month - a.month);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={flatId === "all" ? "default" : "outline"} onClick={() => setFlatId("all")}>All</Button>
        {flats.map((f) => (
          <Button key={f.id} size="sm" variant={flatId === f.id ? "default" : "outline"} onClick={() => setFlatId(f.id)}>
            Flat {f.flat_number}
          </Button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground"><History className="h-6 w-6 mx-auto mb-2 opacity-50" />No history yet</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const flat = flats.find((f) => f.id === r.flat_id);
            return (
              <Card key={r.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">Flat {flat?.flat_number} • {monthLabel(r.month, r.year)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {Number(r.units).toFixed(0)} units • Bill {formatINR(Number(r.electricity_bill))}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <Badge className={statusColor(r.payment_status)}>{statusLabel(r.payment_status)}</Badge>
                  <div className="text-sm font-semibold mt-1 flex items-center justify-end">
                    <IndianRupee className="h-3 w-3" />{Number(r.amount_paid).toFixed(0)} / {Number(r.total_due).toFixed(0)}
                  </div>
                  <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => setEditing(r)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && (
        <EditReadingDialog
          reading={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onSaved={onChange}
        />
      )}
    </div>
  );
}
