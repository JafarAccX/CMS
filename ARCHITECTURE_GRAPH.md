# CMS Architecture Graph

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React + Vite)                     │
│                                                                     │
│  Pages: Login | Register | Dashboard | BatchChat | DM | Admin |     │
│         Mentor | Profile | MyCourses | Subscription                 │
│                                                                     │
│  State (Zustand): authStore | messageStore | dmStore |              │
│                   notificationStore | batchStore | socketStore | ui  │
│                                                                     │
│  Libs: React Query, Socket.io-client, Tailwind, react-window, Zod  │
└──────────────┬──────────────────────────────────┬───────────────────┘
               │ REST (axios)                     │ WebSocket
               ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Express 5 + TS)                      │
│                                                                      │
│  ┌─────────┐   ┌─────────────┐   ┌──────────┐   ┌───────────────┐  │
│  │ Routes  │──▶│ Controllers │──▶│ Services │──▶│ Prisma (DB)   │  │
│  └─────────┘   └─────────────┘   └──────────┘   └───────────────┘  │
│       │                                                │             │
│  ┌─────────────┐  ┌────────────┐              ┌───────▼──────┐     │
│  │ Middlewares │  │ Validators │              │ PostgreSQL   │     │
│  │ • auth(JWT) │  │ (Zod)      │              └──────────────┘     │
│  │ • rateLimit │  └────────────┘                                    │
│  │ • upload    │                                                    │
│  │ • errorHndl │  ┌────────────┐              ┌──────────────┐     │
│  └─────────────┘  │ Sockets.io │◀────────────▶│ Redis        │     │
│                    └────────────┘              └──────────────┘     │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌─────────┐ ┌──────────┐
        │ Brevo    │ │ CRM API │ │ LMS API  │
        │ (Email/  │ │ (sync)  │ │ (courses)│
        │  OTP)    │ │         │ │          │
        └──────────┘ └─────────┘ └──────────┘
```

## Database Schema Relations

```
Organization (1)──────(N) Batch (1)──────(N) Message
                            │                    │
                            │                    ├──(N) MessageAttachment
                            │                    ├──(N) MessageReaction
                            │                    ├──(N) PinnedMessage
                            │                    ├──(1) parent ←→ (N) replies [threads]
                            │                    └──(N) ModQueue
                            │
                            └──(N) Membership (N)──────(1) User
                                                            │
                User ◀─────────────────────────────────────┘
                  │
                  ├──(1) Subscription
                  ├──(N) Notification
                  ├──(N) AdminLog
                  ├──(N) Conversation (user_a / user_b)
                  │         └──(N) DirectMessage
                  │                   └──(N) DirectMessageAttachment
                  └──(N) MessageReaction
```

## User Roles & Access

```
admin ──────────▶ Full system control, user mgmt, batch mgmt
mentor ─────────▶ Mentor dashboard, batch mentoring
batch_moderator ▶ Moderate messages in assigned batches
learner ────────▶ Join batches, chat, DM, profile
guest ──────────▶ Limited access (if batch allows guests)
```

## API Route Map

```
/api
├── /auth          → register, login, logout, me, refresh
├── /otp           → send-otp, verify-otp, resend
├── /batches       → CRUD batches
├── /batches/:id/messages → send, list, delete, pin, react
├── /batches/:id/members  → join, leave, list, kick
├── /dm            → conversations, send, list messages
├── /admin         → users, batches, logs, ban/unban
├── /mentor        → mentor-specific endpoints
├── /notifications → list, mark-read
├── /modqueue      → report, list, resolve
├── /subscriptions → current plan, upgrade
├── /profile       → get/update profile
├── /upload        → file upload endpoint
│
/api/integration   → CRM/LMS webhook endpoints (API-key auth)
```

## Real-time Events (Socket.io)

```
Client → Server:
  join_batch, leave_batch, send_message, typing,
  join_dm, send_dm, dm_typing

Server → Client:
  new_message, message_deleted, user_joined, user_left,
  typing_indicator, new_dm, dm_typing_indicator,
  notification, online_users
```

## File Structure Quick Reference

```
backend/src/
├── index.ts              ← Entry point (Express + Socket.io server)
├── routes/index.ts       ← All API routes
├── routes/integration.routes.ts ← CRM/LMS integration
├── controllers/          ← 12 controller files
├── services/             ← 13 service files (business logic)
├── middlewares/          ← auth, rateLimit, upload, errorHandler
├── validators/index.ts   ← Zod schemas
├── sockets/index.ts      ← Socket.io event handlers
└── utils/                ← prisma, jwt, redis, permissions, errors

frontend/src/
├── App.tsx               ← Router + protected routes
├── main.tsx              ← Entry point
├── pages/                ← 10 page components
├── components/           ← Shared UI components
├── store/                ← 7 Zustand stores
├── hooks/useSocket.ts    ← Socket.io hook
└── api/client.ts         ← Axios instance
```
