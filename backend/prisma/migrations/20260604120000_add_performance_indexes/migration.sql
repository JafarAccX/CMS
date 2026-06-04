-- Performance indexes for slow queries identified in profiling.
-- Uses IF NOT EXISTS so re-running is safe.

-- users: phone lookup (learner-login), is_banned filter (DM list), role filter
CREATE INDEX IF NOT EXISTS "users_phone_idx"     ON "users"("phone");
CREATE INDEX IF NOT EXISTS "users_is_banned_idx" ON "users"("is_banned");
CREATE INDEX IF NOT EXISTS "users_role_idx"      ON "users"("role");

-- memberships: mentor picker (batch_id + role_in_batch), user batch list
CREATE INDEX IF NOT EXISTS "memberships_batch_role_idx" ON "memberships"("batch_id", "role_in_batch");
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx"    ON "memberships"("user_id");

-- notifications: unread count + ordered list per user
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx"    ON "notifications"("user_id", "is_read");
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications"("user_id", "created_at" DESC);

-- conversations: DM list ordered by most recent
CREATE INDEX IF NOT EXISTS "conversations_user_a_updated_idx" ON "conversations"("user_a_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "conversations_user_b_updated_idx" ON "conversations"("user_b_id", "updated_at" DESC);

-- direct_messages: message history + unread count
CREATE INDEX IF NOT EXISTS "direct_messages_conv_created_idx" ON "direct_messages"("conversation_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_messages_conv_read_idx"    ON "direct_messages"("conversation_id", "is_read");
