import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/billing";

export function StatCard({
  label,
  value,
  variant,
  sub,
}: {
  label: string;
  value: number;
  variant: "info" | "success" | "warning";
  sub?: string;
}) {
  const bg =
    variant === "success" ? "bg-success/10 border-success/30"
    : variant === "warning" ? "bg-warning/15 border-warning/40"
    : "bg-info/10 border-info/30";
  const valueColor =
    variant === "success" ? "text-success"
    : variant === "warning" ? "text-warning"
    : "text-info";
  return (
    <Card className={`p-3 sm:p-4 border ${bg}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className={`text-lg sm:text-2xl font-bold mt-1 ${valueColor}`}>
        {formatINR(value)}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
