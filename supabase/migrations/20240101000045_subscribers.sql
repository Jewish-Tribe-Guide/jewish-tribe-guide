-- ─────────────────────────────────────────────────────────────────────────────
-- Category subscriptions — visitors opt in (by email) to be notified when a
-- new listing is approved into a category they care about, or an existing
-- one is reported closed and archived. See SubscribeSection.tsx (desktop-only
-- for now) and src/app/api/subscribers/route.ts.
--
-- `categories` null/empty means "all categories" rather than a real category
-- list — see subscriberStore.ts's matching logic. Public INSERT only: this is
-- personal data, not public content like `category`/`page`, so there is no
-- public SELECT policy — only the service-role key (used server-side to look
-- up matching subscribers when sending, and to handle unsubscribe) can read
-- or delete rows.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists subscriber (
  id                 uuid primary key default gen_random_uuid(),
  community_id       text not null,
  email              text not null,
  categories         text[],
  notify_add         boolean not null default true,
  notify_closure     boolean not null default true,
  unsubscribe_token  text not null default encode(gen_random_bytes(24), 'hex'),
  created_at         timestamptz not null default now()
);

-- Resubmitting the form (e.g. to change which categories you're subscribed
-- to) updates the existing row instead of creating a second one. A plain
-- column pair, not a lower(email) expression index — subscriberStore.ts
-- always lowercases before writing, and upsert's ON CONFLICT target has to
-- name a real constraint's columns exactly, not an arbitrary expression.
create unique index if not exists subscriber_community_email_idx
  on subscriber (community_id, email);

create unique index if not exists subscriber_unsubscribe_token_idx
  on subscriber (unsubscribe_token);

create index if not exists subscriber_community_idx on subscriber (community_id);

alter table subscriber enable row level security;
create policy "public can subscribe" on subscriber for insert with check (true);
