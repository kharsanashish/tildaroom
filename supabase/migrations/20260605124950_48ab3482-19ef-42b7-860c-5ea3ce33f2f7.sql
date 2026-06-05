
-- 1. Trigger to restrict tenant updates to non-financial columns only
CREATE OR REPLACE FUNCTION public.enforce_tenant_reading_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'owner'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Non-owner (tenant): only curr_reading may change. Everything else must remain identical.
  IF NEW.flat_id IS DISTINCT FROM OLD.flat_id
     OR NEW.month IS DISTINCT FROM OLD.month
     OR NEW.year IS DISTINCT FROM OLD.year
     OR NEW.prev_reading IS DISTINCT FROM OLD.prev_reading
     OR NEW.units IS DISTINCT FROM OLD.units
     OR NEW.rate_per_unit IS DISTINCT FROM OLD.rate_per_unit
     OR NEW.electricity_bill IS DISTINCT FROM OLD.electricity_bill
     OR NEW.rent IS DISTINCT FROM OLD.rent
     OR NEW.maintenance IS DISTINCT FROM OLD.maintenance
     OR NEW.other_charges IS DISTINCT FROM OLD.other_charges
     OR NEW.opening_balance IS DISTINCT FROM OLD.opening_balance
     OR NEW.total_due IS DISTINCT FROM OLD.total_due
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.payment_timestamp IS DISTINCT FROM OLD.payment_timestamp
  THEN
    RAISE EXCEPTION 'Tenants may only update the current meter reading';
  END IF;
  NEW.source := 'tenant';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_reading_update ON public.meter_readings;
CREATE TRIGGER trg_enforce_tenant_reading_update
BEFORE UPDATE ON public.meter_readings
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_reading_update();

-- 2. Restrictive INSERT policy on user_roles: only owners may insert
DROP POLICY IF EXISTS "only owner inserts roles" ON public.user_roles;
CREATE POLICY "only owner inserts roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

-- 3. Revoke EXECUTE on has_role from anon and public; keep authenticated (RLS needs it)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
