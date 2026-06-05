import { z } from "zod";

// ─── Shared helpers ────────────────────────────────────────

/**
 * Strong password: min 8 chars, at least one letter, at least one digit.
 * Applied consistently across register / reset / change-password so the
 * policy can be updated in one place.
 */
export const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[a-zA-Z]/.test(v), "Password must contain at least one letter")
  .refine((v) => /\d/.test(v), "Password must contain at least one number");

// ─── Auth ──────────────────────────────────────────────────
export const registerSchema = z.object({
  username: z.string().min(2).max(50),
  email: z.string().email(),
  phone: z.string().min(10).max(20),
  password: strongPassword,
  role: z.enum(["admin", "mentor", "batch_moderator", "learner", "guest"]).optional(),
  provider: z.enum(["crm", "website"]),
});

export const loginSchema = z.object({
  identifier: z.string().min(1, "Email, phone number, or CRM ID is required"),
  password: z.string().min(1),
  provider: z.enum(["crm", "website"]),
});

// ─── Batches ───────────────────────────────────────────────
export const createBatchSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  type: z.enum(["general", "private", "paid", "public", "hidden"]),
  is_paid: z.boolean().optional(),
  org_id: z.string().uuid().optional(),
  allow_guests: z.boolean().optional(),
  max_members: z.number().int().positive().optional(),
});


export const updateBatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  type: z.enum(["general", "private", "paid", "public", "hidden"]).optional(),
  is_paid: z.boolean().optional(),
  allow_guests: z.boolean().optional(),
  max_members: z.number().int().positive().nullable().optional(),
});


// ─── Channels ──────────────────────────────────────────────
export const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
});

export const renameChannelSchema = z.object({
  name: z.string().min(1).max(80),
});

// ─── Members ───────────────────────────────────────────────
export const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role_in_batch: z.enum(["member", "mentor", "moderator"]),
});

export const updateMemberRoleSchema = z.object({
  role_in_batch: z.enum(["member", "mentor", "moderator"]),
});

// ─── Messages ──────────────────────────────────────────────
export const sendMessageSchema = z.object({
  channel_id: z.string().uuid(),
  content: z.string().max(5000).optional(),
  message_type: z.enum(["text", "file", "system"]).optional(),
  parent_id: z.string().uuid().optional(),
});

export const flagMessageSchema = z.object({
  priority: z.enum(["low", "medium", "high"]).optional(),
  notes: z.string().max(500).optional(),
});

// ─── Mod Queue ─────────────────────────────────────────────
export const updateModQueueSchema = z.object({
  status: z.enum(["pending", "resolved", "escalated"]),
  notes: z.string().max(500).optional(),
});

// ─── Subscription ──────────────────────────────────────────
export const upgradeSubscriptionSchema = z.object({
  plan: z.enum(["pro"]).optional(),
});

// ─── Profile ───────────────────────────────────────────────
export const updateProfileSchema = z.object({
  username: z.string().min(2).max(50).optional(),
  bio: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPassword,
});

// ─── Broadcast ─────────────────────────────────────────────
export const broadcastSchema = z.object({
  content: z.string().min(1).max(5000),
  channelIds: z.array(z.string().uuid()).optional(), // if omitted → all channels
});

// ─── Socket events ─────────────────────────────────────────
const attachmentSchema = z.object({
  file_url: z.string(),
  file_name: z.string(),
  file_size: z.number(),
  mime_type: z.string(),
});

export const socketSendMessageSchema = z.object({
  channelId: z.string().uuid(),
  content: z.string().max(5000).optional(),
  messageType: z.enum(["text", "file", "system"]).optional(),
  parentId: z.string().uuid().optional(),
  tempId: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
}).refine(data => data.content || (data.attachments && data.attachments.length > 0), {
  message: "Message must have either content or attachments",
});

export const socketJoinChannelSchema = z.object({
  channelId: z.string().uuid(),
});

export const socketSendDmSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().max(5000).optional(),
  tempId: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
}).refine(data => data.content || (data.attachments && data.attachments.length > 0), {
  message: "Direct message must have either content or attachments",
});

export const socketJoinDmSchema = z.object({
  conversationId: z.string().uuid(),
});

// ─── Shared types (for frontend) ───────────────────────────
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type RenameChannelInput = z.infer<typeof renameChannelSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type FlagMessageInput = z.infer<typeof flagMessageSchema>;
export type UpdateModQueueInput = z.infer<typeof updateModQueueSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type BroadcastInput = z.infer<typeof broadcastSchema>;
