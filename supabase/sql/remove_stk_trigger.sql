-- Remove the problematic trigger that was trying to use pg_net
-- The frontend will handle STK push calls directly (no database trigger needed)

DROP TRIGGER IF EXISTS repayment_send_stk_trigger ON public.repayments;
DROP FUNCTION IF EXISTS public.trigger_send_stk_push();

-- Confirm triggers removed
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'public' AND event_object_table = 'repayments';
