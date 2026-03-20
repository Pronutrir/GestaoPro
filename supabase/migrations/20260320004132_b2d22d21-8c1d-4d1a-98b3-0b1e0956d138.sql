
-- Make activity_id optional for standalone stories
ALTER TABLE public.user_stories ALTER COLUMN activity_id DROP NOT NULL;
ALTER TABLE public.user_stories ALTER COLUMN activity_id SET DEFAULT NULL;

-- Add narrative and image fields
ALTER TABLE public.user_stories ADD COLUMN IF NOT EXISTS narrative text DEFAULT '';
ALTER TABLE public.user_stories ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;

-- Create storage bucket for user story images
INSERT INTO storage.buckets (id, name, public) VALUES ('user-story-images', 'user-story-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Auth users can upload story images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'user-story-images');
CREATE POLICY "Anyone can view story images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'user-story-images');
CREATE POLICY "Auth users can delete story images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'user-story-images');
