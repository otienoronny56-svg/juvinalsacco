-- Revert: Drop the trigger and function that updates Paybill on registration fee
DROP TRIGGER IF EXISTS update_paybill_reg_fee_trigger ON public.transactions;
DROP FUNCTION IF EXISTS public.update_paybill_on_reg_fee();