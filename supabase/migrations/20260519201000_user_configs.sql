-- user_configs: credenziali (GitHub token, AI keys) + preferences per utente
-- Schema mirror del v1 firebase user_configs collection
create table public.user_configs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  credentials jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{
    "defaultAiModel": "auto",
    "theme": "dark",
    "terminalSettings": {"fontSize": 14, "fontFamily": "monospace"}
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_user_configs_updated_at
  before update on public.user_configs
  for each row execute function public.set_updated_at();

alter table public.user_configs enable row level security;

create policy "user_configs: select own"
  on public.user_configs for select using (auth.uid() = user_id);

create policy "user_configs: insert own"
  on public.user_configs for insert with check (auth.uid() = user_id);

create policy "user_configs: update own"
  on public.user_configs for update using (auth.uid() = user_id);

comment on table public.user_configs is 'Credenziali utente (GitHub token, AI keys) + preferences. Una riga per user.';
