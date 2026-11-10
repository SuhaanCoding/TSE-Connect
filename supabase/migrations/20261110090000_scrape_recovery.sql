-- Preserve a per-profile receipt and serialize runs before paying for an actor.
alter table public.scrape_runs
  add column if not exists input_urls text[] not null default '{}',
  add column if not exists provider text not null default 'primary',
  add column if not exists profile_results jsonb not null default '[]',
  add column if not exists primary_processed_at timestamptz,
  add column if not exists recovery_requested_at timestamptz,
  add column if not exists recovery_run_id text,
  add column if not exists recovery_dataset_id text,
  add column if not exists unresolved_count integer not null default 0,
  add column if not exists processing_token uuid,
  add column if not exists processing_started_at timestamptz,
  add column if not exists callback_configured boolean not null default false;

create unique index if not exists scrape_runs_single_active
  on public.scrape_runs ((true)) where status = 'running';

comment on column public.scrape_runs.profile_results is
  'Admin-only per-input import receipts: provider, updated fields, roster IDs and unresolved reason. No credentials or member-authored content.';

-- Admin routes authenticate first and use service_role; browser clients do not
-- need direct access to operational receipts or processing leases.
revoke all on table public.scrape_runs from public, anon, authenticated;
