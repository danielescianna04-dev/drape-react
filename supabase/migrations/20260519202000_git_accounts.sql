-- git_accounts: GitHub/GitLab/Bitbucket/Gitea account linkati a un utente Drape
create table public.git_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,                       -- 'github', 'gitlab', 'bitbucket', 'gitea', ecc.
  username text not null,
  avatar_url text,
  access_token text not null,                   -- TODO v2.1: cifratura con pgsodium
  refresh_token text,
  expires_at timestamptz,
  server_url text,                              -- per istanze self-hosted (enterprise/server)
  is_default boolean not null default false,
  scopes text[],
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider, username, server_url)
);

create index idx_git_accounts_user_id on public.git_accounts(user_id);
create index idx_git_accounts_provider on public.git_accounts(provider);

create trigger trg_git_accounts_updated_at
  before update on public.git_accounts
  for each row execute function public.set_updated_at();

alter table public.git_accounts enable row level security;

create policy "git_accounts: select own"
  on public.git_accounts for select using (auth.uid() = user_id);

create policy "git_accounts: insert own"
  on public.git_accounts for insert with check (auth.uid() = user_id);

create policy "git_accounts: update own"
  on public.git_accounts for update using (auth.uid() = user_id);

create policy "git_accounts: delete own"
  on public.git_accounts for delete using (auth.uid() = user_id);

comment on table public.git_accounts is 'Git provider accounts (github/gitlab/bitbucket/gitea) linkati agli utenti Drape';
