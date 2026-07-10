import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RouteGuard } from "@/components/route-guard";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, LogOut, Loader2, Bell } from "lucide-react";
import { toast } from "sonner";
import { currentMonthYear, monthLabel, MONTH_NAMES, type PaymentStatus } from "@/lib/billing";
import { getRateFor } from "@/lib/rates";
import { RatePrompt } from "@/components/rate-prompt";
import { JanuaryReview } from "@/components/january-review";
import { RatesManager } from "@/components/rates-manager";
import { subscribePush } from "@/lib/push";

// Extracted components
import { StatCard } from "@/components/stat-card";
import { FlatCard } from "@/components/flat-card";
import { FlatDialog } from "@/components/flat-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { ApprovalsList } from "@/components/approvals-list";
import { HistoryView } from "@/components/history-view";
import { SendNotificationDialog } from "@/components/send-notification-dialog";

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
  tenant_whatsapp: string;
  rent: number;
  maintenance: number;
  other_charges: number;
  prev_meter_reading: number;
  security_deposit: number;
  is_vacant?: boolean;
  due_date?: number | null;
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
  maintenance: number;
  other_charges: number;
  opening_balance: number;
  total_due: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_timestamp: string | null;
}
interface Settings {
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

  // CODE QUALITY: Error handling on all Supabase reads
  const refresh = async () => {
    const [{ data: f, error: fe }, { data: r, error: re }, { data: s, error: se }] =
      await Promise.all([
        supabase.from("flats").select("*").order("flat_number"),
        supabase.from("meter_readings").select("*"),
        supabase.from("settings").select("*").eq("id", 1).single(),
      ]);
    if (fe) toast.error(`Failed to load flats: ${fe.message}`);
    if (re) toast.error(`Failed to load readings: ${re.message}`);
    if (se) toast.error(`Failed to load settings: ${se.message}`);
    setFlats((f as Flat[]) ?? []);
    setReadings((r as Reading[]) ?? []);
    setSettings(s as Settings);
    setMonthRate(await getRateFor(month, year, 0));
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  // Subscribe this owner to Web Push so tenants can notify them
  const { user } = useAuth();
  useEffect(() => {
    if (user?.id) {
      subscribePush(user.id);
      // Store owner_id in settings so tenants can look up who to notify
      supabase.from("settings").update({ owner_id: user.id }).eq("id", 1).then(() => {});
    }
  }, [user?.id]);

  const currentReadings = useMemo(
    () => readings.filter((r) => r.month === month && r.year === year),
    [readings, month, year],
  );

  // Same opening-balance logic as tenant.tsx: carries forward any unpaid
  // (or overpaid) amount from the tenant's most recent prior reading.
  const openingBalanceFor = (flatId: string) => {
    const prev = [...readings]
      .filter((r) => r.flat_id === flatId && !(r.month === month && r.year === year))
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    if (!prev) return 0;
    const approved = prev.payment_status === "paid" || prev.payment_status === "partial";
    return (approved ? Number(prev.amount_paid) : 0) - Number(prev.total_due);
  };

  // Stats: Expected / Collected / Pending — skip vacant flats
  const stats = useMemo(() => {
    let expected = 0, collected = 0, pending = 0;
    for (const f of flats) {
      if (f.is_vacant) continue; // vacant flat contributes ₹0
      const r = currentReadings.find((x) => x.flat_id === f.id);
      if (r) {
        expected += Number(r.total_due);
        const approved = r.payment_status === "paid" || r.payment_status === "partial";
        if (approved) {
          collected += Number(r.amount_paid);
          pending += Math.max(0, Number(r.total_due) - Number(r.amount_paid));
        } else {
          pending += Number(r.total_due);
        }
      } else {
        const fallback = Number(f.rent) + Number(f.maintenance ?? 0) + Number(f.other_charges) - openingBalanceFor(f.id);
        expected += fallback;
        pending += fallback;
      }
    }
    return { expected, collected, pending };
  }, [flats, currentReadings, readings]);

  // Flats with outstanding rent (no reading or partial/unpaid reading; skip vacant)
  const outstandingFor = (flat: Flat, reading?: Reading) => {
    if (reading) {
      return Math.max(0, Number(reading.total_due) - Number(reading.amount_paid));
    }
    return Math.max(0, Number(flat.rent) + Number(flat.maintenance ?? 0) + Number(flat.other_charges) - openingBalanceFor(flat.id));
  };

  const pendingFlats = useMemo(
    () => flats.filter(
      (f) => !f.is_vacant && (f.tenant_id || f.tenant_whatsapp) && outstandingFor(f, currentReadings.find((r) => r.flat_id === f.id)) > 0
    ),
    [flats, currentReadings, readings],
  );

  const pendingApprovalCount = readings.filter(
    (r) => r.payment_status === "pending_approval"
  ).length;

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
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm">Owner Dashboard</div>
              <div className="text-xs text-muted-foreground">
                {monthLabel(month, year)}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            <SendNotificationDialog flats={flats} />
            <RatesManager onChange={refresh} />
            <SettingsDialog
              settings={settings!}
              onSaved={refresh}
              currentRate={monthRate}
            />
            <Button size="sm" variant="ghost" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {/* Stats — current month collective data from all tenants */}
        <div>
          <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
            {monthLabel(month, year)} — Collection Overview
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Expected" value={stats.expected} variant="info" sub="This month" />
            <StatCard label="Collected" value={stats.collected} variant="success" sub="Approved" />
            <StatCard label="Pending" value={stats.pending} variant="warning" sub="Outstanding" />
          </div>
        </div>

        <Tabs defaultValue="flats">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="flats">Flats</TabsTrigger>
            <TabsTrigger value="approvals">
              Approvals
              {pendingApprovalCount > 0 && (
                <Badge className="ml-2 bg-warning text-warning-foreground h-5">
                  {pendingApprovalCount}
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

            {/* FEATURE: Remind tenants with outstanding rent */}
            {pendingFlats.length > 0 && (
              <Card className="p-3 border-warning/40 bg-warning/10">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-warning flex-shrink-0" />
                    <span className="text-sm font-medium">
                      {pendingFlats.length} flat{pendingFlats.length > 1 ? "s have" : " has"} outstanding rent
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unreadFlats.map((f) => {
                      const monthName = MONTH_NAMES[month - 1];
                      const reading = currentReadings.find((r) => r.flat_id === f.id);
                      // Match tenant Bill Breakdown "To Be Paid" (शेष देय) = total_due - amount_paid
                      const toBePaid = reading
                        ? Math.max(0, Number(reading.total_due) - Number(reading.amount_paid))
                        : null;
                      const dueAmount = toBePaid !== null && toBePaid > 0
                        ? toBePaid
                        : reading
                          ? Number(reading.total_due)
                          : Number(f.rent) + Number(f.maintenance ?? 0) + Number(f.other_charges) - openingBalanceFor(f.id);
                      const electricityNote = reading
                        ? " (including electricity charges)"
                        : " (excluding electricity charges)";
                      const dueClause = f.due_date
                        ? ` your due date is ${String(f.due_date).padStart(2, "0")}/${monthName}`
                        : "";
                      const msg = `Mr. ${f.tenant_name || "Tenant"} your rent is due for the ${monthName} month that is ₹${Math.round(dueAmount)}${electricityNote}${dueClause} please pay timely, Ignore if already paid. Thank You`;
                      // Normalize mobile: strip non-digits, ensure country code
                      const rawMobile = (f.tenant_whatsapp || f.tenant_mobile || "").replace(/\D/g, "");
                      const mobile = rawMobile.length === 10 ? `91${rawMobile}` : rawMobile;
                      const hasMobile = mobile.length >= 11;
                      return (
                        <Button
                          key={f.id}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-warning/50"
                          onClick={() => {
                            if (!hasMobile) {
                              toast.error("No mobile number on file");
                              return;
                            }
                            window.open(
                              `https://wa.me/${mobile}?text=${encodeURIComponent(msg)}`,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                          title="Send WhatsApp reminder"
                        >
                          <Bell className="h-3 w-3 mr-1" />
                          Remind Flat {f.flat_number}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            )}

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
                    month={month}
                    year={year}
                    onChange={refresh}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="approvals" className="mt-4">
            <ApprovalsList flats={flats} readings={readings} settings={settings} onChange={refresh} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <HistoryView
              flats={flats}
              readings={readings}
              settings={settings}
              onChange={refresh}
            />
          </TabsContent>
        </Tabs>
      </main>

      {settings && <RatePrompt />}
      <JanuaryReview onDone={refresh} />
    </div>
  );
}
