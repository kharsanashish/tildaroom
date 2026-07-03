
-- 1. Payments: harden tenant INSERT policy
DROP POLICY IF EXISTS "tenant insert own payment" ON public.payments;
CREATE POLICY "tenant insert own payment"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.flats f WHERE f.id = payments.flat_id AND f.tenant_id = auth.uid())
    AND payments.tenant_id = auth.uid()
    AND payments.status = 'pending_approval'
    AND payments.approved_at IS NULL
  );

-- 2. Payments: explicit restrictive policies so tenants cannot ever UPDATE/DELETE,
--    even if a future permissive policy is added.
DROP POLICY IF EXISTS "only owner may update payments" ON public.payments;
CREATE POLICY "only owner may update payments"
  ON public.payments AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

DROP POLICY IF EXISTS "only owner may delete payments" ON public.payments;
CREATE POLICY "only owner may delete payments"
  ON public.payments AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role));

-- 3. Settings: restrict full row to owner; expose safe public view for tenants.
DROP POLICY IF EXISTS "all auth read settings" ON public.settings;
CREATE POLICY "owner reads settings"
  ON public.settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role));

DROP VIEW IF EXISTS public.public_owner_info;
CREATE VIEW public.public_owner_info
  WITH (security_invoker = true) AS
  SELECT id, owner_upi_id, owner_name, owner_id
  FROM public.settings;

GRANT SELECT ON public.public_owner_info TO authenticated;
