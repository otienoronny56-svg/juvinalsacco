-- 1. Give Admins explicit permission to insert transactions for any user
CREATE POLICY transactions_insert_admin ON public.transactions
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- 2. Modify Trigger to run as SECURITY DEFINER so it can securely update the accounts table
CREATE OR REPLACE FUNCTION public.update_paybill_on_reg_fee()
RETURNS TRIGGER AS $body
BEGIN
  -- Only for completed registration fees
  IF NEW.type = 'registration_fee' AND NEW.status = 'completed' THEN
    UPDATE public.accounts 
    SET balance = COALESCE(balance, 0) + NEW.amount 
    WHERE name = 'paybill';
  END IF;
  RETURN NEW;
END;
$body LANGUAGE plpgsql SECURITY DEFINER;
