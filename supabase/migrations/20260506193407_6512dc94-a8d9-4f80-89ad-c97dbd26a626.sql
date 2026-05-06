-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('owner', 'tenant');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Settings (single row)
CREATE TABLE public.settings (
  id int PRIMARY KEY DEFAULT 1,
  electricity_rate_per_unit numeric(10,2) NOT NULL DEFAULT 8.00,
  owner_upi_id text NOT NULL DEFAULT '',
  owner_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.settings (id) VALUES (1);

-- Flats
CREATE TABLE public.flats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_number text NOT NULL,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_name text NOT NULL DEFAULT '',
  tenant_mobile text NOT NULL DEFAULT '',
  rent numeric(10,2) NOT NULL DEFAULT 0,
  other_charges numeric(10,2) NOT NULL DEFAULT 0,
  prev_meter_reading numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flats ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_flats_tenant ON public.flats(tenant_id);

-- Meter readings
CREATE TABLE public.meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id uuid NOT NULL REFERENCES public.flats(id) ON DELETE CASCADE,
  month int NOT NULL,
  year int NOT NULL,
  prev_reading numeric(10,2) NOT NULL DEFAULT 0,
  curr_reading numeric(10,2),
  units numeric(10,2) NOT NULL DEFAULT 0,
  rate_per_unit numeric(10,2) NOT NULL DEFAULT 0,
  electricity_bill numeric(10,2) NOT NULL DEFAULT 0,
  rent numeric(10,2) NOT NULL DEFAULT 0,
  other_charges numeric(10,2) NOT NULL DEFAULT 0,
  opening_balance numeric(10,2) NOT NULL DEFAULT 0,
  total_due numeric(10,2) NOT NULL DEFAULT 0,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  payment_method text,
  payment_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flat_id, month, year)
);
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_readings_flat ON public.meter_readings(flat_id, year DESC, month DESC);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_flats_updated BEFORE UPDATE ON public.flats FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_readings_updated BEFORE UPDATE ON public.meter_readings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ===== RLS POLICIES =====

-- user_roles: users can view their own role; only owner can manage
CREATE POLICY "view own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner manages roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- profiles
CREATE POLICY "view own or owner views all" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "user updates own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner manages profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- settings: any authenticated user reads; only owner updates
CREATE POLICY "all auth read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner updates settings" ON public.settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- flats
CREATE POLICY "owner full access flats" ON public.flats FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "tenant views own flat" ON public.flats FOR SELECT TO authenticated USING (tenant_id = auth.uid());

-- meter readings
CREATE POLICY "owner full access readings" ON public.meter_readings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "tenant views own readings" ON public.meter_readings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.flats f WHERE f.id = meter_readings.flat_id AND f.tenant_id = auth.uid()));
CREATE POLICY "tenant inserts own reading" ON public.meter_readings FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.flats f WHERE f.id = meter_readings.flat_id AND f.tenant_id = auth.uid()));
CREATE POLICY "tenant updates own reading" ON public.meter_readings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.flats f WHERE f.id = meter_readings.flat_id AND f.tenant_id = auth.uid()));