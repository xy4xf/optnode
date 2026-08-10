-- optnode — drop the now-unused lifetime-cap columns.
--
-- The subscription link feature was simplified to a single persistent short
-- link (no expiry, no download cap). max_downloads and expires_at are no longer
-- set by any code path, so they are always NULL. Drop them to keep the schema
-- honest. Safe to re-run.

alter table subscriptions
  drop column if exists max_downloads,
  drop column if exists expires_at;
