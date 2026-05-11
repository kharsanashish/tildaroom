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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Building2, LogOut, Loader2, Zap, Receipt, Smartphone, CheckCircle2, XCircle, FileDown, History, Wallet, Banknote } from "lucide-react";
import { toast } from "sonner";
import { buildUpiLink, currentMonthYear, formatINR, monthLabel, statusColor, statusLabel, type PaymentStatus } from "@/lib/billing";
import { getRateFor, hasRateFor } from "@/lib/rates";
import { exportReadingPdf } from "@/lib/pdf";

export const Route = createFileRoute("/tenant")({
  component: () => (
    <RouteGuard require="tenant">
      <TenantDashboard />
    </RouteGuard>
  ),
});

interface Flat {
  id: string; flat_number: string; rent: number; maintenance: number; other_charges: number; prev_meter_reading: number;
  tenant_name: string;
}
interface Reading {
  id: string; flat_id: string; month: number; year: number;
  prev_reading: number; curr_reading: number | null; units: number;
  rate_per_unit: number; electricity_bill: number; rent: number; maintenance: number; other_charges: number;
  opening_balance: number; total_due: number; amount_paid: number; payment_status: PaymentStatus;
  payment_method: string | null; payment_timestamp: string | null;
}
interface Settings {
  electricity_rate_per_unit: number; owner_upi_id: string; owner_name: string; owner_mobile: string;
}

function TenantDashboard() {
  const { user, signOut } = useAuth();
  const [flat, setFlat] = useState<Flat | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [monthRate, setMonthRate] = useState<number>(0);
  const [rateSet, setRateSet] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [currInput, setCurrInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [noRateAmount, setNoRateAmount] = useState("");
  const [paying, setPaying] = useState(false);

  const { month, year } = currentMonthYear();

  const refresh = async () => {
    if (!user) return;
    const { data: f } = await supabase.from("flats").select("*").eq("tenant_id", user.id).maybeSingle();
    setFlat(f as Flat | null);
    const { data: s } = await supabase.from("settings").select("*").eq("id", 1).single();
    setSettings(s as Settings);
    const fallback = Number((s as Settings)?.electricity_rate_per_unit ?? 0);
    setMonthRate(await getRateFor(month, year, fallback));
    setRateSet(await hasRateFor(month, year));
    if (f) {
      const { data: r } = await supabase.from("meter_readings").select("*").eq("flat_id", (f as Flat).id);
      setReadings((r as Reading[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [user]);

  const current = useMemo(
    () => readings.find((r) => r.month === month && r.year === year),
    [readings, month, year],
  );

  const openingBalance = useMemo(() => {
    if (!readings.length) return 0;
    const prev = [...readings]
      .filter((r) => !(r.month === month && r.year === year))
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    if (!prev) return 0;
    const approved = prev.payment_status === "paid" || prev.payment_status === "partial";
    const effectivePaid = approved ? Number(prev.amount_paid) : 0;
    return effectivePaid - Number(prev.total_due);
  }, [readings, month, year]);

  const prevReading = useMemo(() => {
    if (current) return Number(current.prev_reading);
    const prev = [...readings]
      .filter((r) => !(r.month === month && r.year === year) && r.curr_reading != null)
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    return prev ? Number(prev.curr_reading) : Number(flat?.prev_meter_reading ?? 0);
  }, [current, readings, month, year, flat]);

  const rate = monthRate;
  const currNum = current ? Number(current.curr_reading ?? 0) : Number(currInput || 0);
  const units = Math.max(0, currNum - prevReading);
  const electricity = units * rate;
  const rent = Number(flat?.rent ?? 0);
  const maintenance = Number(flat?.maintenance ?? 0);
  const other = Number(flat?.other_charges ?? 0);
  const totalDue = rent + electricity + maintenance + other - openingBalance;

  const saveReading = async () => {
    if (!flat) return;
    if (!rateSet) return toast.error("Owner has not set this month's unit price yet");
    const v = Number(currInput);
    if (!v || v < prevReading) return toast.error(`Reading must be ≥ ${prevReading}`);
    setSaving(true);
    const payload = {
      flat_id: flat.id,
      month, year,
      prev_reading: prevReading,
      curr_reading: v,
      units: v - prevReading,
      rate_per_unit: rate,
      electricity_bill: (v - prevReading) * rate,
      rent, maintenance, other_charges: other,
      opening_balance: openingBalance,
      total_due: rent + (v - prevReading) * rate + maintenance + other - openingBalance,
      amount_paid: 0,
      payment_status: "pending" as const,
    };
    const { error } = current
      ? await supabase.from("meter_readings").update(payload).eq("id", current.id)
      : await supabase.from("meter_readings").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Reading saved"); setCurrInput(""); refresh(); }
  };

  // Ensure a meter_readings row exists for current month (used for no-rate payments)
  const ensureRow = async (): Promise<Reading | null> => {
    if (current) return current;
    if (!flat) return null;
    const baseTotal = rent + maintenance + other - openingBalance;
    const payload = {
      flat_id: flat.id, month, year,
      prev_reading: prevReading, curr_reading: null,
      units: 0, rate_per_unit: 0, electricity_bill: 0,
      rent, maintenance, other_charges: other,
      opening_balance: openingBalance,
      total_due: baseTotal,
      amount_paid: 0,
      payment_status: "pending" as const,
    };
    const { data, error } = await supabase.from("meter_readings").insert(payload).select("*").single();
    if (error) { toast.error(error.message); return null; }
    return data as Reading;
  };

  const handlePay = () => {
    if (!current) return toast.error("Save reading first");
    if (!settings?.owner_upi_id) return toast.error("Owner has not set UPI ID yet");
    const link = buildUpiLink({
      pa: settings.owner_upi_id,
      pn: settings.owner_name || "Owner",
      am: Number(current.total_due) - Number(current.amount_paid),
      tn: `Flat ${flat?.flat_number} ${monthLabel(month, year)} Rent`,
    });
    window.location.href = link;
    setTimeout(() => setConfirmOpen(true), 1500);
  };

  const submitPayment = async (amount: number, method: "upi" | "cash", openWhatsApp: boolean) => {
    if (!flat) return;
    setPaying(true);
    const row = await ensureRow();
    if (!row) { setPaying(false); return; }
    const { error } = await supabase.from("meter_readings").update({
      amount_paid: amount,
      payment_status: "pending_approval",
      payment_method: method,
      payment_timestamp: new Date().toISOString(),
    }).eq("id", row.id);
    setPaying(false);
    if (error) return toast.error(error.message);

    toast.success(`${method === "cash" ? "Cash" : "Payment"} marked pending approval.`);
    refresh();

    if (openWhatsApp) {
      const mobile = (settings?.owner_mobile || "").replace(/\D/g, "");
      if (mobile) {
        const label = method === "cash" ? "Cash payment" : "Payment done";
        const msg = `${label} for Flat ${flat.flat_number} - ${monthLabel(month, year)} ₹${amount.toFixed(0)}.${method === "upi" ? " Screenshot attached." : ""}`;
        const url = `https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank");
      } else {
        toast.warning("Owner mobile not set in settings");
      }
    }
  };

  const payNoRateUpi = async () => {
    const amount = Number(noRateAmount);
    if (!amount || amount <= 0) return toast.error("Enter valid amount");
    if (!settings?.owner_upi_id) return toast.error("Owner has not set UPI ID yet");
    const link = buildUpiLink({
      pa: settings.owner_upi_id,
      pn: settings.owner_name || "Owner",
      am: amount,
      tn: `Flat ${flat?.flat_number} ${monthLabel(month, year)}`,
    });
    window.location.href = link;
    setTimeout(async () => {
      await submitPayment(amount, "upi", true);
      setNoRateAmount("");
    }, 1500);
  };

  const payNoRateCash = async () => {
    const amount = Number(noRateAmount);
    if (!amount || amount <= 0) return toast.error("Enter valid amount");
    if (!confirm(`Mark ₹${amount.toFixed(0)} as cash paid? Owner must approve.`)) return;
    await submitPayment(amount, "cash", true);
    setNoRateAmount("");
  };

  const confirmPayment = async (success: boolean) => {
    setConfirmOpen(false);
    if (!success) return toast.info("Payment kept as pending");
    if (!current) return;
    const amount = Number(current.total_due) - Number(current.amount_paid);
    await submitPayment(amount, "upi", true);
  };

  const payPartial = async () => {
    if (!current) return toast.error("Save reading first");
    const amount = Number(partialAmount);
    if (!amount || amount <= 0) return toast.error("Enter valid amount");
    if (!settings?.owner_upi_id) return toast.error("Owner has not set UPI ID yet");
    const link = buildUpiLink({
      pa: settings.owner_upi_id,
      pn: settings.owner_name || "Owner",
      am: amount,
      tn: `Flat ${flat?.flat_number} ${monthLabel(month, year)} Partial`,
    });
    window.location.href = link;
    setTimeout(async () => {
      await submitPayment(amount, "upi", true);
      setPartialAmount("");
    }, 1500);
  };

  const payCash = async () => {
    if (!current) return toast.error("Save reading first");
    const amount = Number(current.total_due) - Number(current.amount_paid);
    if (!confirm(`Mark ₹${amount.toFixed(0)} as cash paid? Owner must approve.`)) return;
    await submitPayment(amount, "cash", true);
  };

  const payPartialCash = async () => {
    if (!current) return toast.error("Save reading first");
    const amount = Number(partialAmount);
    if (!amount || amount <= 0) return toast.error("Enter valid amount");
    if (!confirm(`Mark ₹${amount.toFixed(0)} as cash paid (partial)? Owner must approve.`)) return;
    await submitPayment(amount, "cash", true);
    setPartialAmount("");
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!flat) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold">No flat assigned</h2>
        <p className="text-sm text-muted-foreground mt-1">Contact your owner.</p>
        <Button onClick={signOut} variant="outline" className="mt-4"><LogOut className="h-4 w-4 mr-1" />Sign out</Button>
      </div>
    );
  }

  const status: PaymentStatus = current?.payment_status ?? "pending";
  const canPay = status === "pending" || status === "rejected" || status === "partial";
  const readingSubmitted = !!(current && current.curr_reading != null);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm">Flat {flat.flat_number}</div>
              <div className="text-xs text-muted-foreground">{monthLabel(month, year)}</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        <Tabs defaultValue="current">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="current">Current</TabsTrigger>
            <TabsTrigger value="history"><History className="h-3.5 w-3.5 mr-1" />History</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-4 mt-4">
            <Card className="p-5 text-center" style={{ background: status === "paid" ? "oklch(0.95 0.06 150 / 0.6)" : "var(--gradient-primary)", color: status === "paid" ? "var(--success-foreground)" : "var(--primary-foreground)" }}>
              <div className="text-sm opacity-80">कुल देय / Total Payable</div>
              <div className="text-4xl font-bold mt-1">{formatINR(current ? Number(current.total_due) - Number(current.amount_paid) : totalDue)}</div>
              <Badge className={`mt-2 ${statusColor(status)}`}>{statusLabel(status)}</Badge>
              {status === "rejected" && (
                <div className="text-xs mt-2 opacity-90">Owner rejected — please repay.</div>
              )}
              {status === "pending_approval" && (
                <div className="text-xs mt-2 opacity-90">Awaiting owner approval.</div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-warning" />
                <h3 className="font-semibold">बिजली रीडिंग / Meter Reading</h3>
              </div>
              {!rateSet && (
                <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
                  Owner has not set this month's unit price yet. Reading is locked. You can still pay rent / dues below.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Previous</Label>
                  <Input value={prevReading} readOnly className="bg-muted" />
                </div>
                <div>
                  <Label className="text-xs">Current {current && current.curr_reading != null && "(saved)"}</Label>
                  <Input
                    value={current && current.curr_reading != null ? String(current.curr_reading) : currInput}
                    onChange={(e) => setCurrInput(e.target.value)}
                    type="number"
                    inputMode="numeric"
                    disabled={!rateSet || status === "paid" || status === "pending_approval"}
                    placeholder={rateSet ? "Enter reading" : "Locked"}
                  />
                </div>
              </div>
              {(rateSet && status !== "paid" && status !== "pending_approval") && (
                <Button onClick={saveReading} disabled={saving || !currInput} className="w-full mt-3">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (current && current.curr_reading != null) ? "Update Reading" : "Save Reading"}
                </Button>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">बिल विवरण / Bill Breakdown</h3>
              </div>
              <div className="space-y-2 text-sm">
                <Row label="Units consumed" value={`${units.toFixed(0)} × ₹${rate}`} />
                <Row label="बिजली बिल / Electricity" value={formatINR(electricity)} />
                <Row label="किराया / Rent" value={formatINR(rent)} />
                <Row label="मेंटेनेंस / Maintenance" value={formatINR(maintenance)} />
                <Row label="अन्य / Other charges" value={formatINR(other)} />
                <Row
                  label={openingBalance >= 0 ? "पिछला बैलेंस / Previous balance (advance)" : "पिछला बकाया / Previous balance (due)"}
                  value={`${openingBalance > 0 ? "−" : openingBalance < 0 ? "+" : ""} ${formatINR(Math.abs(openingBalance))}`}
                  className={openingBalance > 0 ? "text-success" : openingBalance < 0 ? "text-destructive" : ""}
                />
                <div className="border-t pt-2 mt-2 flex justify-between font-bold text-base">
                  <span>कुल / Total</span>
                  <span>{formatINR(current ? Number(current.total_due) : totalDue)}</span>
                </div>
              </div>
            </Card>

            {canPay && !rateSet && (
              <Card className="p-4 space-y-3">
                <h3 className="font-semibold text-sm">भुगतान / Payment (Manual amount)</h3>
                <p className="text-[11px] text-muted-foreground">
                  Owner has not set this month's unit price. Enter the amount you want to pay (rent / dues). Electricity will be billed once owner sets the rate.
                </p>
                <div>
                  <Label className="text-xs">Amount ₹</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Enter amount"
                    value={noRateAmount}
                    onChange={(e) => setNoRateAmount(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={payNoRateUpi} disabled={paying || !noRateAmount} className="flex-1">
                    <Smartphone className="h-4 w-4 mr-1" /> Pay via UPI
                  </Button>
                  <Button onClick={payNoRateCash} disabled={paying || !noRateAmount} variant="outline" className="flex-1">
                    <Banknote className="h-4 w-4 mr-1" /> Cash
                  </Button>
                </div>
              </Card>
            )}

            {canPay && rateSet && !readingSubmitted && (
              <Card className="p-4 text-center space-y-2 border-dashed">
                <h3 className="font-semibold text-sm">भुगतान विकल्प / Payment Options</h3>
                <p className="text-xs text-muted-foreground">
                  🔒 Submit your current meter reading above to unlock payment options.
                </p>
              </Card>
            )}

            {current && canPay && rateSet && readingSubmitted && (
              <Card className="p-4 space-y-3">
                <h3 className="font-semibold text-sm">भुगतान विकल्प / Payment Options</h3>

                <Button
                  onClick={handlePay}
                  disabled={paying}
                  className="w-full h-12 text-base font-semibold"
                  style={{ background: "var(--gradient-warm)", color: "var(--warning-foreground)" }}
                >
                  <Smartphone className="h-5 w-5 mr-2" />
                  Pay Full {formatINR(Number(current.total_due) - Number(current.amount_paid))} via UPI
                </Button>

                <div className="border-t pt-3">
                  <Label className="text-xs flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Partial Payment (UPI)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Custom amount ₹"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                    />
                    <Button onClick={payPartial} disabled={paying || !partialAmount} variant="outline">
                      <Smartphone className="h-4 w-4 mr-1" /> UPI
                    </Button>
                    <Button onClick={payPartialCash} disabled={paying || !partialAmount} variant="outline">
                      <Banknote className="h-4 w-4 mr-1" /> Cash
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Remaining due carries forward to next month.
                  </p>
                </div>

                <Button
                  onClick={payCash}
                  disabled={paying}
                  variant="outline"
                  className="w-full h-11"
                >
                  <Banknote className="h-4 w-4 mr-2" />
                  Mark Full as Cash Paid (owner approval required)
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <HistoryList readings={readings} flat={flat} settings={settings} />
          </TabsContent>
        </Tabs>
      </main>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => setConfirmOpen(false)}>
          <Card className="w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Is your transaction successful?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Send screenshot to owner for confirmation.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => confirmPayment(false)}>
                <XCircle className="h-4 w-4 mr-1" /> No
              </Button>
              <Button className="flex-1" onClick={() => confirmPayment(true)} style={{ background: "var(--success)", color: "var(--success-foreground)" }}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Yes
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function HistoryList({ readings, flat, settings }: { readings: Reading[]; flat: Flat; settings: Settings | null }) {
  const sorted = [...readings].sort((a, b) => b.year - a.year || b.month - a.month).slice(0, 12);
  if (sorted.length === 0) {
    return <Card className="p-6 text-center text-muted-foreground"><History className="h-6 w-6 mx-auto mb-2 opacity-50" />No history yet</Card>;
  }
  return (
    <div className="space-y-2">
      {sorted.map((r) => (
        <Card key={r.id} className="p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-sm">{monthLabel(r.month, r.year)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {Number(r.units).toFixed(0)} units • {formatINR(Number(r.total_due))}
            </div>
            <Badge className={`mt-1 ${statusColor(r.payment_status)}`}>{statusLabel(r.payment_status)}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => exportReadingPdf({
            reading: r, flatNumber: flat.flat_number, tenantName: flat.tenant_name, ownerName: settings?.owner_name,
          })}>
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
        </Card>
      ))}
    </div>
  );
}

function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between ${className}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
