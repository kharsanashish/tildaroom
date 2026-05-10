
ALTER TABLE public.flats ADD COLUMN IF NOT EXISTS maintenance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.flats ADD COLUMN IF NOT EXISTS tenant_whatsapp text NOT NULL DEFAULT '';
ALTER TABLE public.meter_readings ADD COLUMN IF NOT EXISTS maintenance numeric NOT NULL DEFAULT 0;
