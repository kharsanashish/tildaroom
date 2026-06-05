
-- Tenant documents table
CREATE TABLE public.tenant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('rental_agreement','aadhaar','pan')),
  file_path text NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_documents TO authenticated;
GRANT ALL ON public.tenant_documents TO service_role;

ALTER TABLE public.tenant_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manages own documents"
  ON public.tenant_documents FOR ALL TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "owner manages all documents"
  ON public.tenant_documents FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

-- Storage policies: path convention {tenant_id}/{filename}
CREATE POLICY "tenant rw own doc files"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'tenant-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'tenant-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "owner rw all doc files"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'tenant-documents'
    AND has_role(auth.uid(), 'owner'::app_role)
  )
  WITH CHECK (
    bucket_id = 'tenant-documents'
    AND has_role(auth.uid(), 'owner'::app_role)
  );
