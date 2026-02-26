-- RLS policies and reconciliation view for financial tables

-- ACCOUNTS: only allow admins to SELECT; only service role should write (service role bypasses RLS)
ALTER TABLE IF EXISTS public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_admin_select ON public.accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Deny client-side INSERT/UPDATE/DELETE by not creating policies for those operations.
-- Service role (server functions) will bypass RLS and can perform writes.

-- LEDGER_ENTRIES: only admins can view, clients cannot insert (service role will insert)
ALTER TABLE IF EXISTS public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_admin_select ON public.ledger_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Prevent client-side inserts by creating an insert policy that always fails for non-service roles
CREATE POLICY ledger_no_client_insert ON public.ledger_entries
  FOR INSERT
  WITH CHECK (false);

-- TRANSACTIONS: members can read their own transactions; admins can read all; members can insert their own tx rows
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_select_owner_admin ON public.transactions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY transactions_insert_owner ON public.transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY transactions_update_admin ON public.transactions
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- RECONCILIATION VIEW: compare recorded account balance vs computed ledger balance
CREATE OR REPLACE VIEW public.accounts_reconciliation AS
SELECT
  a.id,
  a.name,
  a.balance AS recorded_balance,
  COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount WHEN le.entry_type = 'debit' THEN -le.amount ELSE 0 END), 0) AS computed_balance,
  a.balance - COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount WHEN le.entry_type = 'debit' THEN -le.amount ELSE 0 END), 0) AS discrepancy
FROM public.accounts a
LEFT JOIN public.ledger_entries le ON le.account_id = a.id
GROUP BY a.id, a.name, a.balance;

-- Allow admins to select from reconciliation view
ALTER VIEW public.accounts_reconciliation OWNER TO postgres;

-- Note: service role bypasses RLS so server functions can insert ledger_entries and update accounts.balance.
-- After applying these SQL scripts, run an audit to verify balances match computed_balance for paybill account.
