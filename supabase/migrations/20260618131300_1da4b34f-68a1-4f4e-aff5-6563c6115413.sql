
-- 1. PAYMENTS table: one row per installment, immutable once approved.
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_id uuid NOT NULL REFERENCES public.meter_readings(id) ON DELETE CASCADE,
  flat_id uuid NOT NULL REFERENCES public.flats(id) ON DELETE CASCADE,
  tenant_id uuid,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'upi' CHECK (method IN ('upi','cash')),
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','approved','rejected')),
  receipt_no text,
  note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_reading ON public.payments(reading_id);
CREATE INDEX IF NOT EXISTS idx_payments_flat ON public.payments(flat_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner full access payments" ON public.payments;
CREATE POLICY "owner full access payments" ON public.payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'owner'::app_role));

DROP POLICY IF EXISTS "tenant insert own payment" ON public.payments;
CREATE POLICY "tenant insert own payment" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.flats f
    WHERE f.id = payments.flat_id AND f.tenant_id = auth.uid()
  ));

DROP POLICY IF EXISTS "tenant read own payments" ON public.payments;
CREATE POLICY "tenant read own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.flats f
    WHERE f.id = payments.flat_id AND f.tenant_id = auth.uid()
  ));

-- 2. updated_at trigger
DROP TRIGGER IF EXISTS tg_payments_updated_at ON public.payments;
CREATE TRIGGER tg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Enforce tenant rules on payments
CREATE OR REPLACE FUNCTION public.enforce_payment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_receipt text;
  v_count int;
  v_flat_no text;
  v_month int;
  v_year int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    -- Tenant inserts: lock down trust-sensitive fields
    NEW.status := 'pending_approval';
    NEW.approved_at := NULL;
    NEW.tenant_id := auth.uid();
  END IF;

  -- Auto-generate receipt_no if missing
  IF NEW.receipt_no IS NULL OR NEW.receipt_no = '' THEN
    SELECT f.flat_number, mr.month, mr.year
      INTO v_flat_no, v_month, v_year
      FROM meter_readings mr
      JOIN flats f ON f.id = mr.flat_id
      WHERE mr.id = NEW.reading_id;
    SELECT COUNT(*) + 1 INTO v_count
      FROM payments WHERE reading_id = NEW.reading_id;
    NEW.receipt_no := 'R-' || REPLACE(COALESCE(v_flat_no,'X'),' ','-')
                      || '-' || v_year || LPAD(v_month::text,2,'0')
                      || '-' || LPAD(v_count::text,2,'0');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_payment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Approved payments are immutable in status/amount (no demotion ever)
  IF OLD.status = 'approved' THEN
    IF NEW.status <> 'approved' THEN
      RAISE EXCEPTION 'Approved payments cannot change status';
    END IF;
    IF NEW.amount <> OLD.amount THEN
      RAISE EXCEPTION 'Approved payment amount is immutable';
    END IF;
  END IF;

  -- Tenants cannot update payments at all
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Tenants cannot modify payment records';
  END IF;

  -- Stamp approved_at when transitioning to approved
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_payment_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Approved payment records cannot be deleted';
  END IF;
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Tenants cannot delete payment records';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_payments_enforce_insert ON public.payments;
CREATE TRIGGER tg_payments_enforce_insert
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_insert();

DROP TRIGGER IF EXISTS tg_payments_enforce_update ON public.payments;
CREATE TRIGGER tg_payments_enforce_update
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_update();

DROP TRIGGER IF EXISTS tg_payments_enforce_delete ON public.payments;
CREATE TRIGGER tg_payments_enforce_delete
  BEFORE DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_delete();

-- 4. Recompute helper: aggregates approved + pending into meter_readings
CREATE OR REPLACE FUNCTION public.recompute_reading_payment(p_reading_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  ELSIF v_has_approved AND v_sum >= COALESCE(v_total,0) THEN
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

CREATE OR REPLACE FUNCTION public.tg_recompute_reading_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_reading_payment(OLD.reading_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_reading_payment(NEW.reading_id);
    IF TG_OP = 'UPDATE' AND NEW.reading_id <> OLD.reading_id THEN
      PERFORM public.recompute_reading_payment(OLD.reading_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tg_payments_recompute ON public.payments;
CREATE TRIGGER tg_payments_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_reading_payment();

-- 5. Allow recompute to bypass tenant reading enforcement
CREATE OR REPLACE FUNCTION public.enforce_tenant_reading_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  NEW.total_due := NEW.rent + NEW.maintenance + NEW.other_charges + v_elec - COALESCE(OLD.opening_balance,0);
  NEW.source := 'tenant';
  RETURN NEW;
END;
$$;

-- 6. Backfill: for each existing reading with amount_paid > 0 OR pending_approval,
-- create a single payment row representing the historical aggregate.
INSERT INTO public.payments (
  reading_id, flat_id, tenant_id, amount, method, status,
  receipt_no, submitted_at, approved_at
)
SELECT
  mr.id,
  mr.flat_id,
  f.tenant_id,
  CASE WHEN mr.amount_paid > 0 THEN mr.amount_paid ELSE mr.total_due END,
  COALESCE(NULLIF(mr.payment_method,''), 'upi'),
  CASE
    WHEN mr.payment_status IN ('paid','partial') THEN 'approved'
    WHEN mr.payment_status = 'pending_approval' THEN 'pending_approval'
    WHEN mr.payment_status = 'rejected' THEN 'rejected'
    ELSE 'pending_approval'
  END,
  'R-' || REPLACE(COALESCE(f.flat_number,'X'),' ','-')
        || '-' || mr.year || LPAD(mr.month::text,2,'0') || '-01',
  COALESCE(mr.payment_timestamp, mr.updated_at),
  CASE WHEN mr.payment_status IN ('paid','partial')
       THEN COALESCE(mr.payment_timestamp, mr.updated_at) END
FROM public.meter_readings mr
JOIN public.flats f ON f.id = mr.flat_id
WHERE (mr.amount_paid > 0 OR mr.payment_status IN ('pending_approval','rejected'))
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.reading_id = mr.id);

-- 7. Recompute all readings now that payments exist
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.meter_readings LOOP
    PERFORM public.recompute_reading_payment(r.id);
  END LOOP;
END $$;
