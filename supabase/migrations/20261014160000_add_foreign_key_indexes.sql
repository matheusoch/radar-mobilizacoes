-- Cover foreign-key columns used in joins and parent-row deletes/updates.
-- These indexes do not change application data or RLS behavior.
create index if not exists idx_chat_messages_reviewed_by on public.chat_messages (reviewed_by);
create index if not exists idx_chat_messages_user_id on public.chat_messages (user_id);
create index if not exists idx_city_event_notifications_event_id on public.city_event_notifications (event_id);
create index if not exists idx_event_community_reports_comment_id on public.event_community_reports (comment_id);
create index if not exists idx_event_community_reports_event_id on public.event_community_reports (event_id);
create index if not exists idx_event_community_reports_reporter_id on public.event_community_reports (reporter_id);
create index if not exists idx_event_community_reports_resolved_by on public.event_community_reports (resolved_by);
create index if not exists idx_event_community_reports_security_information_id on public.event_community_reports (security_information_id);
create index if not exists idx_event_community_suspensions_created_by on public.event_community_suspensions (created_by);
create index if not exists idx_event_discussion_comments_author_id on public.event_discussion_comments (author_id);
create index if not exists idx_event_discussion_comments_reviewed_by on public.event_discussion_comments (reviewed_by);
create index if not exists idx_event_moderation_actions_actor_id on public.event_moderation_actions (actor_id);
create index if not exists idx_event_moderators_created_by on public.event_moderators (created_by);
create index if not exists idx_event_security_information_author_id on public.event_security_information (author_id);
create index if not exists idx_event_security_information_verified_by on public.event_security_information (verified_by);
create index if not exists idx_event_sources_source_id on public.event_sources (source_id);
create index if not exists idx_event_submissions_reviewed_by on public.event_submissions (reviewed_by);
create index if not exists idx_event_submissions_user_id on public.event_submissions (user_id);
create index if not exists idx_event_updates_event_id on public.event_updates (event_id);
create index if not exists idx_event_updates_source_id on public.event_updates (source_id);
create index if not exists idx_notifications_actor_user_id on public.notifications (actor_user_id);
create index if not exists idx_notifications_chat_message_id on public.notifications (chat_message_id);
create index if not exists idx_notifications_parent_message_id on public.notifications (parent_message_id);
create index if not exists idx_poster_match_suggestions_reviewed_by on public.poster_match_suggestions (reviewed_by);
create index if not exists idx_poster_match_suggestions_sha256 on public.poster_match_suggestions (sha256);
