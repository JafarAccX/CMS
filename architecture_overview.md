# Acme Learning System: Architecture & Flow

This document provides a technical overview of the system's design, directory structure, and core data flows.

## 1. System Architecture

The application follows a modern **Decoupled Architecture**:

*   **Frontend**: React (Vite) + TailwindCSS + Zustand (State Management) + React Query (Data Fetching).
*   **Backend**: Node.js (Express) + TypeScript.
*   **Database**: PostgreSQL managed via Prisma ORM.
*   **Real-time**: Socket.io for live messaging and notifications.
*   **Storage**: Local file system for uploads (extensible to S3).

---

## 2. Directory Structure

### 📁 `backend/`
*   `src/index.ts`: The entry point. Initializes Express, Sockets, and Middlewares.
*   `src/routes/`: API endpoint definitions grouped by feature (Auth, Batches, DMs, Admin).
*   `src/controllers/`: Request handlers that parse inputs and call services.
*   `src/services/`: **The Business Logic Layer**. Performs database operations and triggers notifications.
*   `src/sockets/`: Socket.io event handlers (join_batch, send_dm, etc.).
*   `src/middlewares/`: Authentication (JWT), Error Handling, and RBAC (requireRole).
*   `src/validators/`: Zod schemas for validating incoming request bodies.
*   `prisma/schema.prisma`: The source of truth for the database structure.

### 📁 `frontend/`
*   `src/pages/`: Main view components (Dashboard, BatchChat, Admin, DmPage).
*   `src/components/`: Reusable UI elements (NotificationDropdown, Modals, Buttons).
*   `src/store/`: Zustand stores for global state (Auth, Messages, Notifications, DMs).
*   `src/hooks/`: Custom hooks like `useSocket` to encapsulate complex logic.
*   `src/api/`: Axios client configuration with interceptors for token handling.

---

## 3. Core Data Flows

### 🔐 Authentication & Security
1.  **Login**: User sends credentials $\rightarrow$ Backend verifies $\rightarrow$ Returns JWT Access & Refresh tokens.
2.  **RBAC**: Every protected route uses `requireRole('admin' | 'mentor' | ...)` middleware. This checks the `role` field on the authenticated user object.

### 💬 Messaging Flow (Real-time)
1.  **Action**: User types a message and hits Enter.
2.  **Socket Emit**: `send_message` (Batch) or `send_dm` is emitted via `useSocket`.
3.  **Persistence**: Backend saves the message to PostgreSQL.
4.  **Broadcast**: 
    *   **Batch**: Emitted to the entire `batchId` room.
    *   **DM**: Emitted to the specific `conversationId` room and the recipient's personal `user:id` room.
5.  **Notifications**: If it's a DM or a Mention, a `Notification` record is created and a `notify_user` event is sent to the recipient.

### 🛠️ Administrative Control
1.  **Batch Creation**: Admin submits form $\rightarrow$ Backend checks `admin` role $\rightarrow$ Creates `Batch`, `BatchSettings`, and `Organization` (if missing) $\rightarrow$ Returns success.
2.  **User Roles**: Admin changes role in UI $\rightarrow$ `PATCH /admin/users/:id/role` $\rightarrow$ Service updates DB and logs the action in `admin_logs`.

---

## 4. Key Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | React 18 (Frontend) / Express (Backend) |
| **Language** | TypeScript (Strict Mode) |
| **Database** | PostgreSQL |
| **ORM** | Prisma |
| **Styling** | Tailwind CSS / Lucide Icons |
| **Real-time** | Socket.io |
| **State** | Zustand |
| **Notifications**| React Hot Toast |

---

## 5. Security Model

*   **Passwords**: Hashed with `bcrypt` (12 rounds).
*   **Tokens**: JWT stored in `localStorage` (Access) and HTTP-only cookies (Refresh).
*   **Input**: Strictly validated with `Zod` schemas at the entry point of every route.
*   **Database**: Protected against SQL injection by Prisma's parameterized queries.
