CREATE OR REPLACE FUNCTION public.round_bill_amount(p_amount numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_amount IS NULL THEN 0
    WHEN p_amount < 0 THEN -public.round_bill_amount(abs(p_amount))
    WHEN p_amount - floor(p_amount) < 0.80 THEN floor(p_amount)
    ELSE ceil(p_amount)
  END
$$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_reading_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    NEW.total_due := public.round_bill_amount(COALESCE(NEW.rent, 0) + COALESCE(NEW.maintenance, 0) + COALESCE(NEW.other_charges, 0) + COALESCE(NEW.electricity_bill, 0) - COALESCE(NEW.opening_balance, 0));
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
  NEW.total_due := public.round_bill_amount(NEW.rent + NEW.maintenance + NEW.other_charges + v_elec - v_opening);
  NEW.amount_paid := 0;
  NEW.payment_status := 'pending';
  NEW.payment_method := NULL;
  NEW.payment_timestamp := NULL;
  NEW.source := 'tenant';
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_reading_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flat public.flats%ROWTYPE;
  v_rate numeric := 0;
  v_units numeric := 0;
  v_elec numeric := 0;
BEGIN
  -- Bypass when recompute_reading_payment is updating payment aggregates
  IF current_setting('app.bypass_reading_enforce', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'owner'::app_role) THEN
    NEW.total_due := public.round_bill_amount(COALESCE(NEW.rent, 0) + COALESCE(NEW.maintenance, 0) + COALESCE(NEW.other_charges, 0) + COALESCE(NEW.electricity_bill, 0) - COALESCE(NEW.opening_balance, 0));
    RETURN NEW;
  END IF;

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
  NEW.total_due := public.round_bill_amount(NEW.rent + NEW.maintenance + NEW.other_charges + v_elec - COALESCE(OLD.opening_balance,0));
  NEW.source := 'tenant';
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_reading_payment(p_reading_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sum numeric := 0;
  v_total numeric := 0;
  v_has_pending boolean := false;
  v_has_approved boolean := false;
  v_last_method text;
  v_last_ts timestamptz;
  v_status text;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_sum
    FROM payments WHERE reading_id = p_reading_id AND status='approved';
  SELECT EXISTS(SELECT 1 FROM payments WHERE reading_id = p_reading_id AND status='pending_approval')
    INTO v_has_pending;
  v_has_approved := v_sum > 0;
  SELECT method, COALESCE(approved_at, submitted_at) INTO v_last_method, v_last_ts
    FROM payments WHERE reading_id = p_reading_id AND status='approved'
    ORDER BY COALESCE(approved_at, submitted_at) DESC LIMIT 1;

  UPDATE meter_readings
  SET total_due = public.round_bill_amount(COALESCE(rent,0) + COALESCE(maintenance,0) + COALESCE(other_charges,0) + COALESCE(electricity_bill,0) - COALESCE(opening_balance,0))
  WHERE id = p_reading_id
  RETURNING total_due INTO v_total;

  IF v_has_pending AND NOT v_has_approved THEN
    v_status := 'pending_approval';
  ELSIF v_has_approved AND ROUND(v_sum) >= ROUND(COALESCE(v_total,0)) THEN
    v_status := 'paid';
  ELSIF v_has_approved THEN
    v_status := 'partial';
  ELSIF v_has_pending THEN
    v_status := 'pending_approval';
  ELSE
    v_status := 'pending';
  END IF;

  PERFORM set_config('app.bypass_reading_enforce','on',true);
  UPDATE meter_readings SET
    amount_paid = v_sum,
    payment_status = v_status,
    payment_method = COALESCE(v_last_method, payment_method),
    payment_timestamp = COALESCE(v_last_ts, payment_timestamp),
    total_due = v_total
  WHERE id = p_reading_id;
  PERFORM set_config('app.bypass_reading_enforce','off',true);
END;
$function$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.meter_readings LOOP
    PERFORM public.recompute_reading_payment(r.id);
  END LOOP;
END $$;