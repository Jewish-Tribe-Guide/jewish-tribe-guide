-- ─────────────────────────────────────────────────────────────────────────────
-- Per-category UI capabilities (run in Supabase SQL editor, after categories.sql).
--
-- Which affordances each category shows — Add / Edit / Report buttons and the
-- per-category directory search bar. Mirrors the existing `upvotes_enabled`
-- column (votes.sql): a per-category setting layered UNDER the site-wide
-- community.config `ui.*` master switches. Effective = global flag AND this one,
-- so a community can, e.g., let Schools be crowdsourced while Synagogues stay
-- curated. Missing keys default to on (see resolveCapabilities in categories.ts).
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists capabilities jsonb not null default '{}'::jsonb;
