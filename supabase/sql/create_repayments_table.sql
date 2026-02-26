-- Repayments table for tracking all loan repayments
CREATE TABLE IF NOT EXISTS public.repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  mpesa_code TEXT,
  status TEXT DEFAULT 'pending', -- pending, confirmed, failed
  payment_method TEXT DEFAULT 'mpesa', -- mpesa, savings, etc
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  confirmed_at TIMESTAMPTZ DEFAULT NULL
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON public.repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_repayments_user_id ON public.repayments(user_id);
CREATE INDEX IF NOT EXISTS idx_repayments_status ON public.repayments(status);

-- Add total_repaid column to loans table (if not exists)
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS total_repaid NUMERIC(10,2) DEFAULT 0;

-- Create a view for loan status with calculation
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

-- Policies for repayments table
CREATE POLICY "Users can read their own repayment history"
ON public.repayments FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR 
       EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can insert repayment records"
ON public.repayments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can update repayment status"
ON public.repayments FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
