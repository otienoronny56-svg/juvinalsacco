-- 1. Add columns to profiles for registration tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS registration_fee_paid BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS membership_status TEXT DEFAULT 'pending'; -- 'pending', 'approved', 'rejected'

-- 2. Backfill existing users so they are not locked out (Assume current users are paid & approved)
UPDATE public.profiles 
SET registration_fee_paid = TRUE, membership_status = 'approved'
WHERE registration_fee_paid IS FALSE;

-- 3. Update Financial Overview View to include Registration Fees
DROP VIEW IF EXISTS public.financial_overview;

CREATE OR REPLACE VIEW public.financial_overview AS
SELECT
  -- Liquidity = Savings + Registration Fees (Cash collected)
  ((SELECT COALESCE(SUM(savings_balance),0) FROM public.profiles) + 
   (SELECT COALESCE(SUM(amount),0) FROM public.transactions WHERE type = 'registration_fee' AND status = 'completed')) AS total_liquidity,
   
  (SELECT COALESCE(SUM((l.amount * 1.10) - COALESCE(l.total_repaid,0)),0) FROM public.loans l WHERE l.status <> 'closed') AS total_uncollected_loans,
  
  (SELECT COALESCE(SUM(share_capital),0) FROM public.profiles) AS total_share_capital,
  
  (SELECT balance FROM public.accounts WHERE name = 'paybill' LIMIT 1) AS paybill_balance,
  
  (SELECT COALESCE(SUM(amount),0) FROM public.transactions WHERE type = 'registration_fee' AND status = 'completed') AS total_registration_fees;