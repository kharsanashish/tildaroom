import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, IndianRupee, Pencil, FileDown, FileText, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatINR, monthLabel, statusColor, statusLabel, type PaymentStatus } from "@/lib/billing";
import { exportPaymentReceiptPdf, exportMonthlySummaryPdf } from "@/lib/pdf";
import { EditReadingDialog } from "@/components/edit-reading-dialog";
import type { PaymentInstallment } from "@/lib/payments";
import { statusBadgeClass, statusBadgeLabel } from "@/lib/payments";

interface Flat {
  id: string;
  flat_number: string;
  tenant_name: string;
  tenant_whatsapp: string;
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

export function HistoryView({
  flats,
  readings,
  settings,
  onChange,
}: {
  flats: Flat[];
  readings: Reading[];
  settings: Settings | null;
  onChange: () => void;
}) {
  const [flatId, setFlatId] = useState<string | "all">("all");
  const [editing, setEditing] = useState<Reading | null>(null);
  const [payments, setPayments] = useState<PaymentInstallment[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    const { data, error } = await supabase
      .from("payments").select("*").order("submitted_at", { ascending: true });
    if (error) toast.error(error.message);
    setPayments((data as PaymentInstallment[]) ?? []);
  };
  useEffect(() => { load(); }, [readings]);

  const paymentsByReading = useMemo(() => {
    const m = new Map<string, PaymentInstallment[]>();
    for (const p of payments) {
      if (!m.has(p.reading_id)) m.set(p.reading_id, []);
      m.get(p.reading_id)!.push(p);
    }
    return m;
  }, [payments]);

  const filtered = readings
    .filter((r) => flatId === "all" || r.flat_id === flatId)
    .sort((a, b) => b.year - a.year || b.month - a.month);

  const uniqueMonths = Array.from(
    new Map(
      readings.map((r) => [`${r.year}-${r.month}`, { month: r.month, year: r.year }])
    ).values()
  ).sort((a, b) => b.year - a.year || b.month - a.month);

  const handleExportMonthSummary = (month: number, year: number) => {
    const monthReadings = readings.filter((r) => r.month === month && r.year === year);
    const rows = monthReadings.map((r) => {
      const flat = flats.find((f) => f.id === r.flat_id);
      return {
        flatNumber: flat?.flat_number ?? "?",
        tenantName: flat?.tenant_name ?? "—",
        totalDue: Number(r.total_due),
        amountPaid: Number(r.amount_paid),
        paymentStatus: r.payment_status,
      };
    });
    exportMonthlySummaryPdf({
      month, year,
      ownerName: settings?.owner_name,
      ownerMobile: settings?.owner_mobile,
      rows,
    });
  };

  const downloadInstallment = (r: Reading, flat: Flat, p: PaymentInstallment, idx: number, paidBefore: number) => {
    exportPaymentReceiptPdf({
      reading: r,
      payment: p,
      installmentIndex: idx,
      paidBefore,
      flatNumber: flat.flat_number,
      tenantName: flat.tenant_name,
      tenantMobile: flat.tenant_whatsapp,
      ownerName: settings?.owner_name,
      ownerMobile: settings?.owner_mobile,
    });
  };

  const deleteInstallment = async (p: PaymentInstallment) => {
    const { error } = await supabase.from("payments").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(p.status === "approved"
      ? "Payment deleted — balance moved back to pending"
      : "Payment deleted");
    await load();
    onChange();
  };

  const toggle = (id: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

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

      {flatId === "all" && uniqueMonths.length > 0 && (
        <div className="rounded-lg border border-dashed p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Export Month Summary</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueMonths.slice(0, 12).map((m) => (
              <Button key={`${m.year}-${m.month}`} size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => handleExportMonthSummary(m.month, m.year)}>
                <FileDown className="h-3 w-3 mr-1" />
                {monthLabel(m.month, m.year)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <History className="h-6 w-6 mx-auto mb-2 opacity-50" /> No history yet
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const flat = flats.find((f) => f.id === r.flat_id);
            if (!flat) return null;
            const inst = (paymentsByReading.get(r.id) ?? [])
              .slice()
              .sort((a, b) => +new Date(a.submitted_at) - +new Date(b.submitted_at));
            const isOpen = expanded.has(r.id);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      Flat {flat.flat_number} • {monthLabel(r.month, r.year)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {Number(r.units).toFixed(0)} units • Bill {formatINR(Number(r.electricity_bill))}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge className={statusColor(r.payment_status)}>{statusLabel(r.payment_status)}</Badge>
                    <div className="text-sm font-semibold mt-1 flex items-center justify-end">
                      <IndianRupee className="h-3 w-3" />
                      {Number(r.amount_paid).toFixed(0)} / {Number(r.total_due).toFixed(0)}
                    </div>
                    <div className="flex gap-1 mt-2 justify-end">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(r)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      {inst.length > 0 && (
                        <Button size="sm" variant="outline" className="h-7" onClick={() => toggle(r.id)}>
                          {isOpen ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                          {inst.length} payment{inst.length > 1 ? "s" : ""}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {isOpen && inst.length > 0 && (
                  <div className="mt-3 border-t pt-3 space-y-2">
                    {inst.map((p, i) => {
                      const paidBefore = inst
                        .slice(0, i)
                        .filter((x) => x.status === "approved")
                        .reduce((s, x) => s + Number(x.amount), 0);
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="font-medium">
                              #{i + 1} • {formatINR(Number(p.amount))}
                              <span className="text-muted-foreground ml-2 uppercase">{p.method || "upi"}</span>
                            </div>
                            <div className="text-muted-foreground">
                              {new Date(p.approved_at || p.submitted_at).toLocaleDateString("en-IN")}
                              {p.receipt_no ? ` • ${p.receipt_no}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className={statusBadgeClass(p.status)}>
                              {statusBadgeLabel(p.status)}
                            </Badge>
                            <Button size="sm" variant="ghost" className="h-7 px-2"
                              onClick={() => downloadInstallment(r, flat, p, i + 1, paidBefore)}>
                              <FileDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
          onSaved={() => { onChange(); load(); }}
        />
      )}
    </div>
  );
}
