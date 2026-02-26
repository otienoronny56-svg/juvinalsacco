-- DISABLE TRIGGERS TEMPORARILY
ALTER TABLE public.transactions DISABLE TRIGGER USER;
UPDATE public.accounts SET balance = 0 WHERE name = 'paybill';

-- 1. FLUSH ALL OLD DATA
-- This ensures a completely clean testing environment.
DELETE FROM public.loans;
DELETE FROM public.guarantor_requests;
DELETE FROM public.transactions;
DELETE FROM public.notifications;

-- 2. CLEAR OTHER UNRELATED MEMBERS
-- Keeps only the 5 specified test users and the Admin (Ashley)
DELETE FROM public.profiles 
WHERE id NOT IN (
    '18f0a1dd-dfb4-428b-a601-5580971722fd',
    '60494574-e8e5-4ed2-ae7a-832832dc8ff7',
    'bd45d44e-edbb-4e09-ad0d-384ed330740a',
    '4bcefe71-0d77-4997-b5a0-707cc939c1a3',
    'd351d51c-7688-4aea-8124-28dc2e244ecd'
) AND id NOT IN (SELECT id FROM auth.users WHERE email ILIKE 'ashley%onkendi%82@gmail.com');

-- 3. SETUP ADMIN ROLE (Ashley Onkendi)
UPDATE public.profiles
SET 
    is_admin = true,
    membership_status = 'approved',
    full_name = 'Ashley Onkendi'
WHERE id IN (SELECT id FROM auth.users WHERE email ILIKE 'ashley%onkendi%82@gmail.com');


----------------------------------------------------------------------
-- USER 1 (Eligible for Loan - 7 months consistent savings)
-- ID: 18f0a1dd-dfb4-428b-a601-5580971722fd
----------------------------------------------------------------------
UPDATE public.profiles
SET 
    savings_balance = 3500,
    created_at = NOW() - INTERVAL '7 months',
    membership_status = 'approved',
    registration_fee_paid = true,
    locked_guarantee_amount = 0
WHERE id = '18f0a1dd-dfb4-428b-a601-5580971722fd';

INSERT INTO public.transactions (user_id, type, amount, status, mpesa_code, created_at) VALUES 
    ('18f0a1dd-dfb4-428b-a601-5580971722fd', 'registration_fee', 100, 'completed', 'REG_U1', NOW() - INTERVAL '7 months 1 day'),
    ('18f0a1dd-dfb4-428b-a601-5580971722fd', 'deposit', 500, 'completed', 'DEP_U1_M1', NOW() - INTERVAL '7 months'),
    ('18f0a1dd-dfb4-428b-a601-5580971722fd', 'deposit', 500, 'completed', 'DEP_U1_M2', NOW() - INTERVAL '6 months'),
    ('18f0a1dd-dfb4-428b-a601-5580971722fd', 'deposit', 500, 'completed', 'DEP_U1_M3', NOW() - INTERVAL '5 months'),
    ('18f0a1dd-dfb4-428b-a601-5580971722fd', 'deposit', 500, 'completed', 'DEP_U1_M4', NOW() - INTERVAL '4 months'),
    ('18f0a1dd-dfb4-428b-a601-5580971722fd', 'deposit', 500, 'completed', 'DEP_U1_M5', NOW() - INTERVAL '3 months'),
    ('18f0a1dd-dfb4-428b-a601-5580971722fd', 'deposit', 500, 'completed', 'DEP_U1_M6', NOW() - INTERVAL '2 months'),
    ('18f0a1dd-dfb4-428b-a601-5580971722fd', 'deposit', 500, 'completed', 'DEP_U1_M7', NOW() - INTERVAL '1 month');

----------------------------------------------------------------------
-- USER 2: Titus (Eligible for Loan - 8 months consistent savings)
-- ID: 60494574-e8e5-4ed2-ae7a-832832dc8ff7
----------------------------------------------------------------------
UPDATE public.profiles
SET 
    full_name = 'Titus',
    savings_balance = 8000,
    created_at = NOW() - INTERVAL '8 months',
    membership_status = 'approved',
    registration_fee_paid = true,
    locked_guarantee_amount = 0
WHERE id = '60494574-e8e5-4ed2-ae7a-832832dc8ff7';

INSERT INTO public.transactions (user_id, type, amount, status, mpesa_code, created_at) VALUES 
    ('60494574-e8e5-4ed2-ae7a-832832dc8ff7', 'registration_fee', 100, 'completed', 'REG_U2', NOW() - INTERVAL '8 months 1 day'),
    ('60494574-e8e5-4ed2-ae7a-832832dc8ff7', 'deposit', 1000, 'completed', 'DEP_U2_M1', NOW() - INTERVAL '8 months'),
    ('60494574-e8e5-4ed2-ae7a-832832dc8ff7', 'deposit', 1000, 'completed', 'DEP_U2_M2', NOW() - INTERVAL '7 months'),
    ('60494574-e8e5-4ed2-ae7a-832832dc8ff7', 'deposit', 1000, 'completed', 'DEP_U2_M3', NOW() - INTERVAL '6 months'),
    ('60494574-e8e5-4ed2-ae7a-832832dc8ff7', 'deposit', 1000, 'completed', 'DEP_U2_M4', NOW() - INTERVAL '5 months'),
    ('60494574-e8e5-4ed2-ae7a-832832dc8ff7', 'deposit', 1000, 'completed', 'DEP_U2_M5', NOW() - INTERVAL '4 months'),
    ('60494574-e8e5-4ed2-ae7a-832832dc8ff7', 'deposit', 1000, 'completed', 'DEP_U2_M6', NOW() - INTERVAL '3 months'),
    ('60494574-e8e5-4ed2-ae7a-832832dc8ff7', 'deposit', 1000, 'completed', 'DEP_U2_M7', NOW() - INTERVAL '2 months'),
    ('60494574-e8e5-4ed2-ae7a-832832dc8ff7', 'deposit', 1000, 'completed', 'DEP_U2_M8', NOW() - INTERVAL '1 month');

----------------------------------------------------------------------
-- USER 3: Sofia (NOT Eligible - Inconsistent / 2 months duration)
-- ID: bd45d44e-edbb-4e09-ad0d-384ed330740a
----------------------------------------------------------------------
UPDATE public.profiles
SET 
    full_name = 'Sofia',
    savings_balance = 2000,
    created_at = NOW() - INTERVAL '2 months',
    membership_status = 'approved',
    registration_fee_paid = true,
    locked_guarantee_amount = 0
WHERE id = 'bd45d44e-edbb-4e09-ad0d-384ed330740a';

INSERT INTO public.transactions (user_id, type, amount, status, mpesa_code, created_at) VALUES 
    ('bd45d44e-edbb-4e09-ad0d-384ed330740a', 'registration_fee', 100, 'completed', 'REG_U3', NOW() - INTERVAL '2 months 1 day'),
    ('bd45d44e-edbb-4e09-ad0d-384ed330740a', 'deposit', 1000, 'completed', 'DEP_U3_M1', NOW() - INTERVAL '2 months'),
    ('bd45d44e-edbb-4e09-ad0d-384ed330740a', 'deposit', 1000, 'completed', 'DEP_U3_M2', NOW() - INTERVAL '1 month');

----------------------------------------------------------------------
-- USER 4: John (NOT Eligible - Joined 1 month ago)
-- ID: 4bcefe71-0d77-4997-b5a0-707cc939c1a3
----------------------------------------------------------------------
UPDATE public.profiles
SET 
    full_name = 'John',
    savings_balance = 500,
    created_at = NOW() - INTERVAL '1 month',
    membership_status = 'approved',
    registration_fee_paid = true,
    locked_guarantee_amount = 0
WHERE id = '4bcefe71-0d77-4997-b5a0-707cc939c1a3';

INSERT INTO public.transactions (user_id, type, amount, status, mpesa_code, created_at) VALUES 
    ('4bcefe71-0d77-4997-b5a0-707cc939c1a3', 'registration_fee', 100, 'completed', 'REG_U4', NOW() - INTERVAL '1 month 1 day'),
    ('4bcefe71-0d77-4997-b5a0-707cc939c1a3', 'deposit', 500, 'completed', 'DEP_U4_M1', NOW() - INTERVAL '1 month');

----------------------------------------------------------------------
-- USER 5: Justin (Eligible for Loan - 6 months consistent savings)
-- ID: d351d51c-7688-4aea-8124-28dc2e244ecd
----------------------------------------------------------------------
UPDATE public.profiles
SET 
    full_name = 'Justin',
    savings_balance = 6000,
    created_at = NOW() - INTERVAL '6 months',
    membership_status = 'approved',
    registration_fee_paid = true,
    locked_guarantee_amount = 0
WHERE id = 'd351d51c-7688-4aea-8124-28dc2e244ecd';

INSERT INTO public.transactions (user_id, type, amount, status, mpesa_code, created_at) VALUES 
    ('d351d51c-7688-4aea-8124-28dc2e244ecd', 'registration_fee', 100, 'completed', 'REG_U5', NOW() - INTERVAL '6 months 1 day'),
    ('d351d51c-7688-4aea-8124-28dc2e244ecd', 'deposit', 1000, 'completed', 'DEP_U5_M1', NOW() - INTERVAL '6 months'),
    ('d351d51c-7688-4aea-8124-28dc2e244ecd', 'deposit', 1000, 'completed', 'DEP_U5_M2', NOW() - INTERVAL '5 months'),
    ('d351d51c-7688-4aea-8124-28dc2e244ecd', 'deposit', 1000, 'completed', 'DEP_U5_M3', NOW() - INTERVAL '4 months'),
    ('d351d51c-7688-4aea-8124-28dc2e244ecd', 'deposit', 1000, 'completed', 'DEP_U5_M4', NOW() - INTERVAL '3 months'),
    ('d351d51c-7688-4aea-8124-28dc2e244ecd', 'deposit', 1000, 'completed', 'DEP_U5_M5', NOW() - INTERVAL '2 months'),
    ('d351d51c-7688-4aea-8124-28dc2e244ecd', 'deposit', 1000, 'completed', 'DEP_U5_M6', NOW() - INTERVAL '1 month');



-- RE-ENABLE TRIGGERS & RECALCULATE PAYBILL
ALTER TABLE public.transactions ENABLE TRIGGER USER;

UPDATE public.accounts 
SET balance = (
    SELECT COALESCE(SUM(amount), 0) 
    FROM public.transactions 
    WHERE type = 'registration_fee' AND status = 'completed'
)
WHERE name = 'paybill';

-- 4. ENSURE FINANCIAL OVERVIEW VIEW IS CORRECT
-- This recreates the view so that Registration Fees are counted in Total Liquidity and correctly labeled.
CREATE OR REPLACE VIEW public.financial_overview AS
SELECT
  -- Liquidity = Savings + Registration Fees (Cash collected)
  ((SELECT COALESCE(SUM(savings_balance),0) FROM public.profiles) + 
   (SELECT COALESCE(SUM(amount),0) FROM public.transactions WHERE type = 'registration_fee' AND status = 'completed')) AS total_liquidity,
   
  (SELECT COALESCE(SUM((l.amount * 1.10) - COALESCE(l.total_repaid,0)),0) FROM public.loans l WHERE l.status <> 'closed') AS total_uncollected_loans,
  
  (SELECT COALESCE(SUM(share_capital),0) FROM public.profiles) AS total_share_capital,
  
  (SELECT balance FROM public.accounts WHERE name = 'paybill' LIMIT 1) AS paybill_balance,
  
  (SELECT COALESCE(SUM(amount),0) FROM public.transactions WHERE type = 'registration_fee' AND status = 'completed') AS total_registration_fees;


