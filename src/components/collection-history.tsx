import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, FileDown } from "lucide-react";
import { formatINR, monthLabel, type PaymentStatus } from "@/lib/billing";
import { exportMonthlySummaryPdf } from "@/lib/pdf";

interface Reading {
  id: string;
  flat_id: string;
  month: number;
  year: number;
  total_due: number;
  amount_paid: number;
  payment_status: PaymentStatus;
}

interface Flat {
  id: string;
  flat_number: string;
  tenant_name: string;
}

interface MonthStats {
  month: number;
  year: number;
  expected: number;
  collected: number;
  pending: number;
  flatsCount: number;
  paidCount: number;
}

export function CollectionHistoryDialog({
  readings,
  flats,
  ownerName,
  ownerMobile,
}: {
  readings: Reading[];
  flats: Flat[];
  ownerName?: string;
  ownerMobile?: string;
}) {
  const [open, setOpen] = useState(false);

  const history = useMemo<MonthStats[]>(() => {
    const map = new Map<string, MonthStats>();
    for (const r of readings) {
      const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, {
          month: r.month, year: r.year,
          expected: 0, collected: 0, pending: 0,
          flatsCount: 0, paidCount: 0,
        });
      }
      const e = map.get(key)!;
      e.flatsCount++;
      e.expected += Number(r.total_due);
      const approved = r.payment_status === "paid" || r.payment_status === "partial";
      if (approved) {
        e.collected += Number(r.amount_paid);
        if (r.payment_status === "paid") e.paidCount++;
      }
    }
    return [...map.values()]
      .map((e) => ({ ...e, pending: Math.max(0, e.expected - e.collected) }))
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, 12);
  }, [readings]);

  const handleExportMonth = (m: MonthStats) => {
    const monthReadings = readings.filter(
      (r) => r.month === m.month && r.year === m.year
    );
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
    exportMonthlySummaryPdf({ month: m.month, year: m.year, ownerName, ownerMobile, rows });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Collection History">
          <TrendingUp className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto max-w-md">
        <DialogHeader>
          <DialogTitle>Collection History</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-1">
          {history.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No data yet
            </p>
          ) : (
            history.map((m) => {
              const pct =
                m.expected > 0
                  ? Math.round((m.collected / m.expected) * 100)
                  : 0;
              return (
                <div
                  key={`${m.year}-${m.month}`}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">
                      {monthLabel(m.month, m.year)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          pct >= 100
                            ? "default"
                            : pct >= 50
                              ? "secondary"
                              : "destructive"
                        }
                        className="text-xs"
                      >
                        {pct}% collected
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title="Export PDF"
                        onClick={() => handleExportMonth(m)}
                      >
                        <FileDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Expected</div>
                      <div className="font-semibold text-info">
                        {formatINR(m.expected)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Collected</div>
                      <div className="font-semibold text-success">
                        {formatINR(m.collected)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Pending</div>
                      <div className="font-semibold text-warning">
                        {formatINR(m.pending)}
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-success h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
