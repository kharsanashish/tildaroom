
-- Step 1: electricity_rates table
CREATE TABLE public.electricity_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month integer NOT NULL,
  year integer NOT NULL,
  rate_per_unit numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(month, year)
);
ALTER TABLE public.electricity_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access rates" ON public.electricity_rates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "all auth read rates" ON public.electricity_rates FOR SELECT TO authenticated USING (true);

-- Prune trigger: keep newest 12 rows
CREATE OR REPLACE FUNCTION public.prune_electricity_rates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.electricity_rates
  WHERE id IN (
    SELECT id FROM public.electricity_rates
    ORDER BY year DESC, month DESC
    OFFSET 12
  );
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_prune_electricity_rates
  AFTER INSERT ON public.electricity_rates
  FOR EACH STATEMENT EXECUTE FUNCTION public.prune_electricity_rates();

-- Step 2: track flat reviews
ALTER TABLE public.flats ADD COLUMN IF NOT EXISTS last_reviewed_year integer;

-- Step 4: owner mobile in settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS owner_mobile text NOT NULL DEFAULT '';
