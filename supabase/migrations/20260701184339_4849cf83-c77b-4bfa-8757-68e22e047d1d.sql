
CREATE POLICY "Users can upload to their folder in site-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'site-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read own site-media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'site-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own site-media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'site-media' AND auth.uid()::text = (storage.foldername(name))[1]);
