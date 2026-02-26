-- Add role column to profiles if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- Optional: Set admin users manually if needed
-- UPDATE public.profiles SET role = 'admin' WHERE id = 'YOUR_ADMIN_USER_ID';

-- Create/update repayments table with fixed RLS policies
CREATE TABLE IF NOT EXISTS public.repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  mpesa_code TEXT,
  status TEXT DEFAULT 'pending', -- pending, confirmed, failed
  payment_method TEXT DEFAULT 'mpesa',
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  confirmed_at TIMESTAMPTZ DEFAULT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON public.repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_repayments_user_id ON public.repayments(user_id);
CREATE INDEX IF NOT EXISTS idx_repayments_status ON public.repayments(status);

-- Add total_repaid column to loans if it doesn't exist
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS total_repaid NUMERIC(10,2) DEFAULT 0;

-- Create loan status view
CREATE OR REPLACE VIEW public.loan_status_view AS
SELECT 
  l.id,
  l.borrower_id,
  l.amount,
  l.status,
  l.created_at,
  l.total_repaid,
  (l.amount * 0.10) AS interest,
  (l.amount + (l.amount * 0.10)) AS total_due,
  ((l.amount + (l.amount * 0.10)) - l.total_repaid) AS remaining_balance,
  CASE 
    WHEN l.status = 'closed' THEN 'Fully Repaid'
    WHEN ((l.amount + (l.amount * 0.10)) - l.total_repaid) <= 0 THEN 'Ready to Close'
    WHEN l.total_repaid = 0 THEN 'Not Started'
    ELSE 'In Progress'
  END AS repayment_status
FROM public.loans l;

-- Enable RLS on repayments table
ALTER TABLE public.repayments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can read their own repayment history" ON public.repayments;
DROP POLICY IF EXISTS "Users can insert repayment records" ON public.repayments;
DROP POLICY IF EXISTS "Admin can update repayment status" ON public.repayments;

-- Simplified RLS Policies - allow authenticated users to read/insert their own records
CREATE POLICY "Users can read own repayments"
ON public.repayments FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own repayments"
ON public.repayments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow service role (edge functions) to update repayments
CREATE POLICY "Service role can update repayments"
ON public.repayments FOR UPDATE
USING (true)
WITH CHECK (true);

-- Create public view for repayments (for admin to query)
CREATE OR REPLACE VIEW public.repayments_admin_view AS
SELECT 
  r.id,
  r.loan_id,
  r.user_id,
  r.amount,
  r.mpesa_code,
  r.status,
  r.payment_method,
  r.phone,
  r.created_at,
  r.confirmed_at,
  l.amount as loan_amount,
  l.status as loan_status,
  l.total_repaid,
  (l.amount * 0.10) as interest,
  p.full_name,
  p.phone as member_phone
FROM public.repayments r
JOIN public.loans l ON r.loan_id = l.id
JOIN public.profiles p ON r.user_id = p.id;
