-- Run this in your Supabase SQL editor

create table consultants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  skills text not null,
  visa_status text not null,
  location text not null,
  rate numeric not null,
  experience text,
  status text not null default 'bench',
  notes text,
  created_at timestamptz default now()
);

-- Row Level Security: users can only see their own consultants
alter table consultants enable row level security;

create policy "Users manage own consultants"
  on consultants for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
