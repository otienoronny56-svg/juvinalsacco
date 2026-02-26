-- 1. Add the secret admin flag to the databse
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- 2. Give yourself the master key!
UPDATE public.profiles 
SET is_admin = true 
WHERE id = (SELECT id FROM auth.users WHERE email = 'ashleyonkendi82@gmail.com');
