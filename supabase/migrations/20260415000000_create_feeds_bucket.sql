-- Create public "feeds" bucket for regional JSON feeds
-- Files are uploaded by the populate-regional-bestsellers Trigger.dev task

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feeds',
  'feeds',
  true,
  10485760,  -- 10 MB per file (generous; actual files are ~100 KB)
  ARRAY['application/json']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow public read access to feeds bucket
CREATE POLICY "Public read access on feeds"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'feeds');

-- Allow service role to write (Trigger.dev task uses SERVICE_ROLE_KEY)
CREATE POLICY "Service role write access on feeds"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'feeds' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'feeds' AND auth.role() = 'service_role');
