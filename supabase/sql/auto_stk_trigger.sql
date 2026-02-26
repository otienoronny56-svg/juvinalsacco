-- Automated Repayment STK Push Trigger
-- When a repayment record is created, automatically send STK via edge function

-- Create a function that calls the mpesa-push edge function
CREATE OR REPLACE FUNCTION public.trigger_send_stk_push()
RETURNS TRIGGER AS $$
BEGIN
  -- Call edge function via HTTP (requires pg_net extension)
  -- The edge function will handle sending the STK push
  PERFORM net.http_post(
    url := 'https://ckcxwsorhuauxijxzihv.supabase.co/functions/v1/mpesa-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_key')
    ),
    body := jsonb_build_object(
      'amount', NEW.amount,
      'phone', NEW.phone,
      'repaymentId', NEW.id
    )::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on repayments table
DROP TRIGGER IF EXISTS repayment_send_stk_trigger ON public.repayments;

CREATE TRIGGER repayment_send_stk_trigger
AFTER INSERT ON public.repayments
FOR EACH ROW
EXECUTE FUNCTION public.trigger_send_stk_push();

-- Note: pg_net extension must be enabled. If not available, 
-- the system will still work - just without automatic STK push.
-- You can monitor logs to see if the trigger fires.

-- To check if pg_net is available:
-- SELECT * FROM pg_available_extensions WHERE name = 'pg_net';

-- If not available, enable it:
-- CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
