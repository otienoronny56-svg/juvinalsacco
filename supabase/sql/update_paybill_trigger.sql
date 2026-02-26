-- Trigger to update Paybill Account Balance when Registration Fee is paid

CREATE OR REPLACE FUNCTION public.update_paybill_on_reg_fee()
RETURNS TRIGGER AS $$
BEGIN
  -- Only for completed registration fees
  IF NEW.type = 'registration_fee' AND NEW.status = 'completed' THEN
    UPDATE public.accounts 
    SET balance = COALESCE(balance, 0) + NEW.amount 
    WHERE name = 'paybill';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_paybill_reg_fee_trigger ON public.transactions;

CREATE TRIGGER update_paybill_reg_fee_trigger
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_paybill_on_reg_fee();