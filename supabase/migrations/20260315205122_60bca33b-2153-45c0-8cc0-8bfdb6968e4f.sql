
ALTER TABLE public.csc_tickets ADD COLUMN attachment_url text DEFAULT NULL;

INSERT INTO storage.buckets (id, name, public) VALUES ('csc-attachments', 'csc-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth users can upload csc attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'csc-attachments');

CREATE POLICY "Anyone can view csc attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'csc-attachments');

CREATE POLICY "Auth users can delete csc attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'csc-attachments');
