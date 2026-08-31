-- ─────────────────────────────────────────────────────────────────────────────
-- A per-community token that lets a HIDDEN community (visible=false, see
-- 20240101000037) actually be reached — by anyone holding the token, not by
-- guessing the slug. Without this, "Hidden" only removed a community from the
-- switcher/sitemap; the plain URL still rendered normally for anyone who had
-- it, which isn't obscure enough to build a community out on the real
-- database before announcing it.
--
-- Every community gets one, including already-visible ones — cheap, and
-- means a community can be unpublished later without a migration to grow one
-- for it. src/proxy.ts is what actually enforces it (see that file's own
-- comment): a hidden community's `/slug` and `/slug/admin` 404 for anyone
-- who doesn't have `?access=<token>` or the cookie it sets on first use.
-- CommunityManager surfaces the full link for a superadmin to copy and
-- share.
-- ─────────────────────────────────────────────────────────────────────────────

alter table community add column if not exists preview_token uuid not null default gen_random_uuid();
