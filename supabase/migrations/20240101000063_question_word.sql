-- ─────────────────────────────────────────────────────────────────────────────
-- Words the search has been taught (decided Sep 30): an admin, on the "Read
-- questions" tab, agrees with what the AI reader made of a word the site's
-- own search didn't understand ("ikc" is Kosher Cert: IKC), and teaches it.
-- From then on the site's own search reads that word as that filter, in
-- every question, with no AI at all (see src/lib/askWords.ts).
--
-- Run in the Supabase SQL editor. The site works without this table: the
-- search just knows no taught words, and says so in the server log.
--
-- Server-only, as 057, 058 and 062: RLS on, no policies, service_role
-- grants alone. The public site reads the words with the categories, on
-- the server.
--
-- `word` is folded as the search folds it ("cholov" is "chalav", "cy" is
-- "chalav yisroel"), one or more words separated by spaces. A word means
-- one thing: a category (`field_key` null), a yes/no filter of it
-- (`value` null), or one pick of a pick-list filter.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists question_word (
  community_id  text not null,
  word          text not null,
  category_id   text not null,
  field_key     text,
  value         text,
  from_question text,
  taught_by     text not null,
  taught_at     timestamptz not null default now(),
  primary key (community_id, word)
);

alter table question_word enable row level security;
grant select, insert, update, delete on public.question_word to service_role;
