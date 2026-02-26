-- Financials: accounts and ledger for SACCO cash management
-- Creates a single 'paybill' account and a ledger for recording credits/debits

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  balance numeric DEFAULT 0,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  transaction_id uuid, -- reference to transactions.id when applicable
  entry_type text NOT NULL, -- 'credit' | 'debit'
  amount numeric NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Ensure a default paybill account exists
INSERT INTO public.accounts (name, balance)
SELECT 'paybill', 0
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE name = 'paybill');

-- Add share_capital to profiles if missing (used for financial HQ card)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS share_capital numeric DEFAULT 0;

-- Helpful view: summary for admin financial HQ
CREATE OR REPLACE VIEW public.financial_overview AS
SELECT
  (SELECT COALESCE(SUM(savings_balance),0) FROM public.profiles) AS total_liquidity,
  (SELECT COALESCE(SUM((l.amount * 1.10) - COALESCE(l.total_repaid,0)),0) FROM public.loans l WHERE l.status <> 'closed') AS total_uncollected_loans,
  (SELECT COALESCE(SUM(share_capital),0) FROM public.profiles) AS total_share_capital,
  (SELECT balance FROM public.accounts WHERE name = 'paybill' LIMIT 1) AS paybill_balance;
