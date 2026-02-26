-- Enable RLS on id-docs bucket (if not already enabled)
-- Then create policy to allow authenticated users to upload to their own folder

-- Allow authenticated users to upload to their own user folder
insert into storage.buckets (id, name, public) 
values ('id-docs', 'id-docs', true)
on conflict (id) do nothing;

-- Create policy: allow authenticated users to upload their own files
create policy "Authenticated users can upload to own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'id-docs' AND
  (auth.uid()::text = (storage.foldername(name))[1])
);

-- Create policy: allow anyone to read files
create policy "Allow public read access"
on storage.objects
for select
to public
using (bucket_id = 'id-docs');

-- Create policy: allow users to delete their own files
create policy "Users can delete their own files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'id-docs' AND
  (auth.uid()::text = (storage.foldername(name))[1])
);
