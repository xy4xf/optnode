-- optnode — subscription link tables.
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run.

-- ──────────────────────────────────────────────────────────────────────────
-- Subscriptions: one row per generated link.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists subscriptions (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,          -- short code, 10 base32 chars (~50 bit), unguessable
  content        text not null,                 -- converted mihomo YAML, served on download
  node_count     int  not null default 0,
  password_hash  text,                          -- nullable scrypt hash; null = no password
  max_downloads  int,                           -- nullable cap on total downloads
  download_count int  not null default 0,
  expires_at     timestamptz,                   -- nullable absolute expiry of the short link
  creator_ip     text,
  created_at     timestamptz not null default now()
);

create index if not exists subscriptions_created_at_idx on subscriptions (created_at);

-- ──────────────────────────────────────────────────────────────────────────
-- Rate-limit buckets for brute-force / abuse protection.
-- Keyed by "{ip}:{scope}[:extra]:{minute}". Old buckets fall outside the
-- sliding window automatically.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists rate_limits (
  bucket     text primary key,
  hits       int  not null default 0,
  updated_at timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- rl_hit: atomically increment a bucket and return the total hits within the
-- last p_window_secs seconds for the given prefix (ip:scope[:extra]).
-- One round-trip per rate-limit check; safe across instances.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function rl_hit(p_prefix text, p_bucket text, p_window_secs int)
returns int language plpgsql as $$
declare total int;
begin
  insert into rate_limits(bucket, hits, updated_at) values (p_bucket, 1, now())
  on conflict (bucket) do update
    set hits = rate_limits.hits + 1, updated_at = now();
  select coalesce(sum(hits), 0) into total
    from rate_limits
   where bucket like p_prefix || '%'
     and updated_at > now() - (p_window_secs || ' seconds')::interval;
  return total;
end; $$;

-- ──────────────────────────────────────────────────────────────────────────
-- bump_download: atomically increment download_count for a subscription,
-- returning the new value.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function bump_download(p_id uuid)
returns int language plpgsql as $$
declare new_count int;
begin
  update subscriptions set download_count = download_count + 1
   where id = p_id
   returning download_count into new_count;
  return coalesce(new_count, 0);
end; $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Row Level Security: enable with NO policies so the anon key can read/write
-- nothing. The server uses the service role key, which bypasses RLS.
-- ──────────────────────────────────────────────────────────────────────────
alter table subscriptions enable row level security;
alter table rate_limits    enable row level security;

-- ──────────────────────────────────────────────────────────────────────────
-- Optional: clean up expired subscriptions + stale rate-limit buckets.
-- Schedule via Supabase Dashboard → Database → Cron (pg_cron). Example:
--
--   select cron.schedule(
--     'optnode-cleanup', 'every 1 hour',
--     $$ delete from subscriptions where expires_at is not null and expires_at < now();
--        delete from rate_limits where updated_at < now() - interval '2 hours'; $$
--   );
-- ──────────────────────────────────────────────────────────────────────────
