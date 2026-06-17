
-- Fix 1: Prevent tenants from inserting arbitrary financial values into meter_readings.
-- For non-owners, force financial fields to defaults on INSERT; owners are unaffected.
CREATE OR REPLACE FUNCTION public.enforce_tenant_reading_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'owner'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Tenant insert: only flat_id, month, year, curr_reading are tenant-controlled.
  NEW.prev_reading := 0;
  NEW.units := 0;
  NEW.rate_per_unit := 0;
  NEW.electricity_bill := 0;
  NEW.rent := 0;
  NEW.maintenance := 0;
  NEW.other_charges := 0;
  NEW.opening_balance := 0;
  NEW.total_due := 0;
  NEW.amount_paid := 0;
  NEW.payment_status := 'pending';
  NEW.payment_method := NULL;
  NEW.payment_timestamp := NULL;
  NEW.source := 'tenant';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_reading_insert ON public.meter_readings;
CREATE TRIGGER trg_enforce_tenant_reading_insert
BEFORE INSERT ON public.meter_readings
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_reading_insert();

-- Fix 2: Clear stale tenant contact details on flats when tenant_id changes (reassignment/vacancy).
CREATE OR REPLACE FUNCTION public.clear_tenant_info_on_reassign()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    NEW.tenant_name := '';
    NEW.tenant_mobile := '';
    NEW.tenant_whatsapp := '';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_tenant_info_on_reassign ON public.flats;
CREATE TRIGGER trg_clear_tenant_info_on_reassign
BEFORE UPDATE OF tenant_id ON public.flats
FOR EACH ROW EXECUTE FUNCTION public.clear_tenant_info_on_reassign();
