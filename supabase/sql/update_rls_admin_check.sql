-- 1. Update Accounts RLS
DROP POLICY IF EXISTS accounts_admin_select ON public.accounts;
CREATE POLICY accounts_admin_select ON public.accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- 2. Update Ledger Entries RLS
DROP POLICY IF EXISTS ledger_admin_select ON public.ledger_entries;
CREATE POLICY ledger_admin_select ON public.ledger_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- 3. Update Transactions RLS (Select)
DROP POLICY IF EXISTS transactions_select_owner_admin ON public.transactions;
CREATE POLICY transactions_select_owner_admin ON public.transactions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- 4. Update Transactions RLS (Update)
DROP POLICY IF EXISTS transactions_update_admin ON public.transactions;
CREATE POLICY transactions_update_admin ON public.transactions
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));
