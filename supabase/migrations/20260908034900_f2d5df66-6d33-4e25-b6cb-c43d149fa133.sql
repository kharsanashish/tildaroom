CREATE POLICY "tenant manages own bill pdf files"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'bill-pdfs'
    AND EXISTS (
      SELECT 1
      FROM public.flats
      WHERE public.flats.id::text = (storage.foldername(name))[1]
        AND public.flats.tenant_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'bill-pdfs'
    AND EXISTS (
      SELECT 1
      FROM public.flats
      WHERE public.flats.id::text = (storage.foldername(name))[1]
        AND public.flats.tenant_id = auth.uid()
    )
  );