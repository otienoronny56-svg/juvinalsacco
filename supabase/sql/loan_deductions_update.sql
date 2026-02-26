-- Migration to add loan deduction and interest tracking columns

-- 1. Add new columns to the loans table
ALTER TABLE public.loans 
  ADD COLUMN IF NOT EXISTS processing_fee numeric DEFAULT 100,
  ADD COLUMN IF NOT EXISTS insurance_charge numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_home_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_rate_monthly numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS accrued_interest numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date timestamp with time zone;

-- 2. Update the financial_overview view to use the new exact interest calculations
-- Instead of a flat 10%, we now use amount + accrued_interest + penalty_amount - total_repaid

DROP VIEW IF EXISTS public.financial_overview;

CREATE VIEW public.financial_overview AS
SELECT
  (SELECT COALESCE(SUM(savings_balance),0) FROM public.profiles) AS total_liquidity,
  (SELECT COALESCE(SUM((l.amount + COALESCE(l.accrued_interest, 0) + COALESCE(l.penalty_amount, 0)) - COALESCE(l.total_repaid,0)),0) 
   FROM public.loans l 
   WHERE l.status <> 'closed' AND l.status <> 'rejected') AS total_uncollected_loans,
  (SELECT COALESCE(SUM(share_capital),0) FROM public.profiles) AS total_share_capital,
  (SELECT balance FROM public.accounts WHERE name = 'paybill' LIMIT 1) AS paybill_balance;
