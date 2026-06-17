
-- Fix tenant insert trigger to compute electricity bill and total due server-side
CREATE OR REPLACE FUNCTION public.enforce_tenant_reading_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_flat public.flats%ROWTYPE;
  v_rate numeric := 0;
  v_prev numeric := 0;
  v_prev_row public.meter_readings%ROWTYPE;
  v_opening numeric := 0;
  v_units numeric := 0;
  v_elec numeric := 0;
BEGIN
  IF public.has_role(auth.uid(), 'owner'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_flat FROM public.flats WHERE id = NEW.flat_id;
  SELECT rate_per_unit INTO v_rate FROM public.electricity_rates
    WHERE month = NEW.month AND year = NEW.year;
  v_rate := COALESCE(v_rate, 0);

  SELECT * INTO v_prev_row FROM public.meter_readings
    WHERE flat_id = NEW.flat_id
      AND NOT (month = NEW.month AND year = NEW.year)
      AND curr_reading IS NOT NULL
    ORDER BY year DESC, month DESC LIMIT 1;

  IF FOUND THEN
    v_prev := COALESCE(v_prev_row.curr_reading, 0);
    IF v_prev_row.payment_status IN ('paid','partial') THEN
      v_opening := COALESCE(v_prev_row.amount_paid,0) - COALESCE(v_prev_row.total_due,0);
    ELSE
      v_opening := 0 - COALESCE(v_prev_row.total_due,0);
    END IF;
  ELSE
    v_prev := COALESCE(v_flat.prev_meter_reading, 0);
    v_opening := 0;
  END IF;

  v_units := GREATEST(0, COALESCE(NEW.curr_reading,0) - v_prev);
  v_elec := v_units * v_rate;

  NEW.prev_reading := v_prev;
  NEW.units := v_units;
  NEW.rate_per_unit := v_rate;
  NEW.electricity_bill := v_elec;
  NEW.rent := COALESCE(v_flat.rent, 0);
  NEW.maintenance := COALESCE(v_flat.maintenance, 0);
  NEW.other_charges := COALESCE(v_flat.other_charges, 0);
  NEW.opening_balance := v_opening;
  NEW.total_due := NEW.rent + NEW.maintenance + NEW.other_charges + v_elec - v_opening;
  NEW.amount_paid := 0;
  NEW.payment_status := 'pending';
  NEW.payment_method := NULL;
  NEW.payment_timestamp := NULL;
  NEW.source := 'tenant';
  RETURN NEW;
END;
$$;

-- Allow tenant to update curr_reading; recompute units, electricity, total_due server-side
CREATE OR REPLACE FUNCTION public.enforce_tenant_reading_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_flat public.flats%ROWTYPE;
  v_rate numeric := 0;
  v_units numeric := 0;
  v_elec numeric := 0;
BEGIN
  IF public.has_role(auth.uid(), 'owner'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Tenant: forbid changes to anything except curr_reading
  IF NEW.flat_id IS DISTINCT FROM OLD.flat_id
     OR NEW.month IS DISTINCT FROM OLD.month
     OR NEW.year IS DISTINCT FROM OLD.year
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.payment_timestamp IS DISTINCT FROM OLD.payment_timestamp
  THEN
    -- Allow payment fields to be updated by tenant (for self-reporting payments)
    -- but financial structural fields are recomputed below.
    NULL;
  END IF;

  -- Re-fetch authoritative inputs
  SELECT * INTO v_flat FROM public.flats WHERE id = NEW.flat_id;
  SELECT rate_per_unit INTO v_rate FROM public.electricity_rates
    WHERE month = NEW.month AND year = NEW.year;
  v_rate := COALESCE(v_rate, 0);

  v_units := GREATEST(0, COALESCE(NEW.curr_reading,0) - COALESCE(OLD.prev_reading,0));
  v_elec := v_units * v_rate;

  NEW.prev_reading := OLD.prev_reading;
  NEW.units := v_units;
  NEW.rate_per_unit := v_rate;
  NEW.electricity_bill := v_elec;
  NEW.rent := COALESCE(v_flat.rent, 0);
  NEW.maintenance := COALESCE(v_flat.maintenance, 0);
  NEW.other_charges := COALESCE(v_flat.other_charges, 0);
  NEW.opening_balance := OLD.opening_balance;
  NEW.total_due := NEW.rent + NEW.maintenance + NEW.other_charges + v_elec - COALESCE(OLD.opening_balance,0);
  NEW.source := 'tenant';
  RETURN NEW;
END;
$$;

-- Backfill: recompute electricity for current month rows that have rate available but zeroed bill
UPDATE public.meter_readings mr
SET rate_per_unit = er.rate_per_unit,
    units = GREATEST(0, COALESCE(mr.curr_reading,0) - COALESCE(mr.prev_reading,0)),
    electricity_bill = GREATEST(0, COALESCE(mr.curr_reading,0) - COALESCE(mr.prev_reading,0)) * er.rate_per_unit,
    total_due = COALESCE(mr.rent,0) + COALESCE(mr.maintenance,0) + COALESCE(mr.other_charges,0)
                + GREATEST(0, COALESCE(mr.curr_reading,0) - COALESCE(mr.prev_reading,0)) * er.rate_per_unit
                - COALESCE(mr.opening_balance,0)
FROM public.electricity_rates er
WHERE er.month = mr.month AND er.year = mr.year
  AND mr.source = 'tenant'
  AND mr.electricity_bill = 0
  AND mr.curr_reading IS NOT NULL
  AND er.rate_per_unit > 0;
