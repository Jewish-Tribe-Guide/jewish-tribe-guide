-- ─────────────────────────────────────────────────────────────────────────────
-- Per-admin opt-IN: get emailed when another admin approves or rejects a
-- submission. A different default from notify_muted_emails
-- (20240101000041) on purpose — that one is an opt-OUT list because
-- new-submission notifications were already on for everyone before it
-- existed, so "everyone still gets them unless they turn it off" was the
-- only change-free migration. This is a brand-new notification stream
-- nobody has today; defaulting it on for every existing admin would hand
-- out email nobody asked for. Empty '{}' means nobody is opted in yet —
-- each admin turns it on for themselves from the Team tab, same
-- self-service PATCH /api/admin/team shape as notify_muted_emails.
--
-- A real column, not folded into notify_muted_emails, because the two
-- preferences answer different questions ("email me about new
-- submissions" vs. "email me about other admins' decisions") that happen
-- to want opposite defaults — one list genuinely can't represent both.
-- ─────────────────────────────────────────────────────────────────────────────

alter table community add column if not exists notify_review_emails text[] not null default '{}';
