-- Documents table for storing KYC uploads
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  file_name text,
  url text,
  storage_path text,
  verified boolean default false,
  verified_by uuid null,
  verified_at timestamptz null,
  created_at timestamptz default timezone('utc'::text, now())
);

-- Index for quick lookup
create index if not exists idx_documents_user_id on public.documents(user_id);
