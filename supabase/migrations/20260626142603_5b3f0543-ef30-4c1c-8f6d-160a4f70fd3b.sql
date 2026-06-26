CREATE OR REPLACE FUNCTION public.enforce_payment_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only the owner can delete payment records';
  END IF;
  RETURN OLD;
END;
$$;