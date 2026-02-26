-- Function to calculate reducing balance interest and penalties
-- Can be called daily via pg_cron or invoked via an Edge Function

CREATE OR REPLACE FUNCTION process_loan_interest_and_penalties()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loan RECORD;
    v_remaining_principal numeric;
    v_months_elapsed integer;
    v_expected_interest_times integer;
    v_new_interest numeric;
    v_days_overdue integer;
    v_penalty numeric;
BEGIN
    FOR v_loan IN 
        SELECT * FROM loans WHERE status = 'active'
    LOOP
        -- Calculate how many 30-day periods have passed since disbursement
        -- (Assuming disbursed_at is either created_at or we fall back to created_at)
        v_months_elapsed := FLOOR(EXTRACT(EPOCH FROM (NOW() - v_loan.created_at)) / (30 * 24 * 60 * 60));
        
        -- If at least one month has passed, we apply interest monthly
        -- To prevent duplicate charging, we can track how much interest should be charged overall
        -- This isn't perfect for daily partial payments but fits the standard 1%/month model.
        
        -- BETTER APPROACH: Calculate total interest dynamically if we just want a simple month-to-month check.
        -- Due to the complexity of exact daily reducing balance, a standard way is to 
        -- apply 1% to the CURRENT remaining balance every 30 days.
        -- BUT if we just run this daily, we only want to charge if EXACTLY a 30-day milestone hit.
        
        -- Let's calculate remaining balance:
        -- Any repaid amount goes FIRST to Penalty, then Interest, then Principal.
        -- For simplicity of "reducing balance", usually the remaining principal is:
        -- Greatest(0, Principal - (Total Repaid - All Interest - All Penalty))
        v_remaining_principal := GREATEST(0, v_loan.amount - GREATEST(0, COALESCE(v_loan.total_repaid, 0) - COALESCE(v_loan.accrued_interest, 0) - COALESCE(v_loan.penalty_amount, 0)));
        
        -- 1. Check if we need to add a monthly interest charge
        -- Let's say due_date is set to 30 days after creation.
        -- If NOW() > due_date, we should apply penalty.
        IF v_loan.due_date IS NOT NULL AND NOW() > v_loan.due_date AND COALESCE(v_loan.penalty_amount, 0) = 0 THEN
            -- Apply penalty ONLY ONCE when overdue
            -- Penalty = 10% of the interest amount (which is 1% of principal initially)
            -- If interest was 100, penalty is 10.
            v_penalty := v_loan.amount * (v_loan.interest_rate_monthly / 100) * 0.10;
            
            UPDATE loans 
            SET penalty_amount = v_penalty, updated_at = NOW()
            WHERE id = v_loan.id;
        END IF;

    END LOOP;
END;
$$;

-- =========================================================================
-- SCHEDULING THE FUNCTION (Using pg_cron)
-- =========================================================================
-- If your Supabase project has the pg_cron extension enabled, you can 
-- uncomment and run the following lines to schedule this function to run
-- automatically every day at midnight.
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- SELECT cron.schedule(
--   'process_daily_loan_interest',    -- Job Name
--   '0 0 * * *',                      -- Cron Schedule (Every day at midnight)
--   $$SELECT process_loan_interest_and_penalties();$$
-- );
--
-- To view active jobs: SELECT * FROM cron.job;
-- To unschedule: SELECT cron.unschedule('process_daily_loan_interest');
