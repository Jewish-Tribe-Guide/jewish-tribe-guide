-- ─────────────────────────────────────────────────────────────────────────────
-- The one question a category page asks in its list — see
-- CategoryConfig.questionCard and src/lib/questionCards.ts. One of:
--
--   {"kind": "field", "key": "<key>"}   ask a place's missing yes/no or
--                                       pick-list value ("meat, dairy or
--                                       parve?"); an answer is an edit
--                                       suggestion an admin checks
--   {"kind": "confirm"}                 "Been there lately?": is a place
--                                       nobody has confirmed still right
--
-- Null means no question card, which is how every category behaves until an
-- admin chooses one in the category editor. The code reads a category the
-- same way whether or not this column exists yet; only saving a question
-- needs it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists question_card jsonb;
