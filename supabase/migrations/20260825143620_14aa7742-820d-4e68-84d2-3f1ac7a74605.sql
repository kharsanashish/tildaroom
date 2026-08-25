CREATE OR REPLACE FUNCTION public.recompute_reading_payment(p_reading_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  SELECT total_due INTO v_total FROM meter_readings WHERE id = p_reading_id;

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
    payment_timestamp = COALESCE(v_last_ts, payment_timestamp)
  WHERE id = p_reading_id;
  PERFORM set_config('app.bypass_reading_enforce','off',true);
END;
$$;

-- Refresh statuses for all existing readings so the fix applies immediately.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.meter_readings LOOP
    PERFORM public.recompute_reading_payment(r.id);
  END LOOP;
END;
$$;