CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.tenant_credentials (
  tenant_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.tenant_credentials TO service_role;
ALTER TABLE public.tenant_credentials ENABLE ROW LEVEL SECURITY;
-- No policies: table is reachable only through the server-only functions below.

CREATE OR REPLACE FUNCTION public.set_tenant_password(_tenant_id uuid, _password text, _key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.tenant_credentials (tenant_id, secret, updated_at)
  VALUES (_tenant_id, extensions.pgp_sym_encrypt(_password, _key), now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET secret = extensions.pgp_sym_encrypt(_password, _key), updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_password(_tenant_id uuid, _key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_secret bytea;
BEGIN
  SELECT secret INTO v_secret FROM public.tenant_credentials WHERE tenant_id = _tenant_id;
  IF v_secret IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_decrypt(v_secret, _key);
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_password(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_password(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_password(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_password(uuid, text) TO service_role;