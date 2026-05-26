-- Drape v2 — Initial schema
-- Tables: profiles, projects, ai_sessions, ai_runs, files
-- Storage bucket: project-files
-- RLS: utenti vedono/modificano solo i propri dati

------------------------------------------------------------
-- Extensions
------------------------------------------------------------
create extension if not exists pgcrypto;

------------------------------------------------------------
-- updated_at trigger function (shared)
------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

------------------------------------------------------------
-- profiles
------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

------------------------------------------------------------
-- projects (app create dagli utenti Drape)
------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  template text,                              -- es. 'react-vite', 'next', 'html-css-js'

  -- Appwrite linkage (provisioned per project)
  appwrite_project_id text,
  appwrite_database_id text,
  appwrite_api_key_encrypted text,            -- AES-encrypted Appwrite scoped API key
  appwrite_endpoint text default 'https://cloud.appwrite.io/v1',

  -- Lifecycle
  status text not null default 'active',      -- 'active', 'archived', 'deleted'

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_user_id on public.projects(user_id);
create index idx_projects_status on public.projects(status);

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "projects: select own"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "projects: insert own"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "projects: update own"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "projects: delete own"
  on public.projects for delete
  using (auth.uid() = user_id);

------------------------------------------------------------
-- ai_sessions (sessioni chat con l'agent per progetto)
------------------------------------------------------------
create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  status text not null default 'active',      -- 'active', 'completed', 'failed'
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ai_sessions_project_id on public.ai_sessions(project_id);
create index idx_ai_sessions_user_id on public.ai_sessions(user_id);

create trigger trg_ai_sessions_updated_at
  before update on public.ai_sessions
  for each row execute function public.set_updated_at();

alter table public.ai_sessions enable row level security;

create policy "ai_sessions: select own"
  on public.ai_sessions for select
  using (auth.uid() = user_id);

create policy "ai_sessions: insert own"
  on public.ai_sessions for insert
  with check (auth.uid() = user_id);

create policy "ai_sessions: update own"
  on public.ai_sessions for update
  using (auth.uid() = user_id);

create policy "ai_sessions: delete own"
  on public.ai_sessions for delete
  using (auth.uid() = user_id);

------------------------------------------------------------
-- ai_runs (singoli turni dell'agent, per audit e ripresa)
------------------------------------------------------------
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  prompt text,
  response text,
  model text,                                 -- es. 'claude-sonnet-4-7', 'gpt-4o'
  tokens_in int default 0,
  tokens_out int default 0,
  cost_usd numeric(10,6) default 0,
  duration_ms int,
  tool_calls jsonb default '[]'::jsonb,       -- elenco tool_use eseguiti
  error text,
  created_at timestamptz not null default now()
);

create index idx_ai_runs_session_id on public.ai_runs(session_id);
create index idx_ai_runs_user_id on public.ai_runs(user_id);

alter table public.ai_runs enable row level security;

create policy "ai_runs: select own"
  on public.ai_runs for select
  using (auth.uid() = user_id);

create policy "ai_runs: insert own"
  on public.ai_runs for insert
  with check (auth.uid() = user_id);

------------------------------------------------------------
-- files (metadata + storage_key dei file di ogni progetto)
------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  path text not null,                         -- es. 'src/App.tsx'
  storage_key text not null,                  -- path in Supabase Storage bucket
  size_bytes int,
  hash text,                                  -- SHA-256 del contenuto per dedup/diff
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, path)
);

create index idx_files_project_id on public.files(project_id);
create index idx_files_user_id on public.files(user_id);

create trigger trg_files_updated_at
  before update on public.files
  for each row execute function public.set_updated_at();

alter table public.files enable row level security;

create policy "files: select own"
  on public.files for select
  using (auth.uid() = user_id);

create policy "files: insert own"
  on public.files for insert
  with check (auth.uid() = user_id);

create policy "files: update own"
  on public.files for update
  using (auth.uid() = user_id);

create policy "files: delete own"
  on public.files for delete
  using (auth.uid() = user_id);

------------------------------------------------------------
-- Storage bucket: project-files
-- Structure: {user_id}/{project_id}/{file_path}
------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,                                      -- privato (signed URLs)
  10485760,                                   -- 10 MB max file
  null                                        -- mime types: tutti
)
on conflict (id) do nothing;

-- Storage RLS: utenti accedono solo ai propri file (primo segmento path = user_id)
create policy "storage: users read own files"
  on storage.objects for select
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: users insert own files"
  on storage.objects for insert
  with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: users update own files"
  on storage.objects for update
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: users delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

------------------------------------------------------------
-- Comments
------------------------------------------------------------
comment on table public.profiles is 'Estende auth.users con metadata utente Drape';
comment on table public.projects is 'App create dagli utenti Drape; ogni progetto ha un DB Appwrite associato';
comment on table public.ai_sessions is 'Sessioni chat con l''agent AI per un progetto';
comment on table public.ai_runs is 'Singoli turni dell''agent (prompt + response + tool calls) per audit';
comment on table public.files is 'File di ogni progetto; storage in Supabase Storage bucket project-files';
