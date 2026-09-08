ALTER TABLE public.meter_readings
  ADD COLUMN IF NOT EXISTS bill_pdf_url text;

CREATE POLICY "owner manages bill pdf files"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'bill-pdfs'
    AND public.has_role(auth.uid(), 'owner'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'bill-pdfs'
    AND public.has_role(auth.uid(), 'owner'::public.app_role)
  );

CREATE POLICY "tenant reads own bill pdf files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bill-pdfs'
    AND EXISTS (
      SELECT 1
      FROM public.flats
      WHERE public.flats.id::text = (storage.foldername(name))[1]
        AND public.flats.tenant_id = auth.uid()
    )
  );