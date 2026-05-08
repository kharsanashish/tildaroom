import { supabase } from "@/integrations/supabase/client";

export async function getRateFor(month: number, year: number, fallback: number): Promise<number> {
  const { data } = await supabase
    .from("electricity_rates")
    .select("rate_per_unit")
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();
  return data ? Number(data.rate_per_unit) : fallback;
}
