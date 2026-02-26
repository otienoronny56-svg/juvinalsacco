-- Add missing location columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Kenya';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sub_county TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ward TEXT;

-- Backfill existing profiles with default country
UPDATE public.profiles SET country = 'Kenya' WHERE country IS NULL;