# AcceleratorX CMS Backend

Welcome to the backend application for the **AcceleratorX Course & Cohort Management System (CMS)**. This project is a scalable, real-time messaging, notification, and moderation API service built using **Express**, **TypeScript**, **Socket.io**, and **Prisma ORM** with **PostgreSQL**.

---

## 🚀 Key Features

- **Express REST API & WebSockets**:
  - Secure authentication (Access and Refresh JWTs via cookies).
  - Socket.io connection handling for real-time events.
- **Transactional Outbox Pattern**:
  - Outbox relay system ensuring zero-loss event broadcasting by storing socket notifications in the database transactions before emission.
- **Prisma & PostgreSQL Schema**:
  - Core database entities: Users, Organizations, Batches, Channels, Memberships, Messages, Conversations, Direct Messages, Pinned Messages, ModQueue, and Reactions.
- **Scalability with Redis**:
  - Multi-node Socket.io scaling using the `@socket.io/redis-adapter` for distributed pub/sub architecture.
- **Automatic Retention and Purge Jobs**:
  - Cron/Relay background service to periodically prune deleted messages and clean up the database.
- **Brevo Integration**:
  - Handles automated transactional mail and communication services.
- **CORS & Iframe Embed Handling**:
  - CSP frames config allows embedding in LMS platforms seamlessly.

---

## 🛠️ Tech Stack

- **Core Framework**: Express (v5.x), TypeScript (v5.x)
- **Database ORM**: Prisma (v5.x)
- **Database Engine**: PostgreSQL
- **Real-Time Engine**: Socket.io (v4.x)
- **Redis Adapters**: `@socket.io/redis-adapter`, `ioredis`
- **Email Dispatch**: `@getbrevo/brevo`
- **Validation**: Zod
- **Runner/Transpiler**: tsx (TypeScript execute)
- **Testing**: Vitest

---

## 📂 Project Structure

```text
backend/
├── prisma/            # Database schemas, migrations, and seeds
├── src/
│   ├── controllers/   # Route handler controllers
│   ├── middlewares/   # Auth logic, request validation, error handler & loggers
│   ├── routes/        # Express API and integration routes
│   ├── services/      # Business logic (Mail, Retention, Outbox relay)
│   ├── sockets/       # Socket.io event connection registry & logic
│   ├── utils/         # Redis connection, token helpers, database client wrappers
│   ├── validators/    # Zod schemas for query/body validation
│   └── index.ts       # Application entrypoint
├── tests/             # Vitest test files
└── package.json       # Dependencies, scripts, and engine specifications
```

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the root of the `backend/` directory and configure the following variables:

```ini
PORT=4000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
CLIENT_ORIGIN=http://localhost:5173,http://localhost:5174
FRAME_ANCESTORS=http://localhost:3000

# Redis (Optional: Used for multi-node Socket.io scaling)
REDIS_URL=redis://localhost:6379

# Brevo (Email service)
BREVO_API_KEY=your-brevo-api-key

# JWT config
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
```

---

## 🏁 Development Scripts

Install the dependencies:
```bash
npm install
```

Prisma commands:
```bash
# Generate Prisma Client
npm run prisma:generate

# Run Database Migrations
npm run prisma:migrate

# Seed Initial Data
npm run seed

# Run Prisma Studio (Database Viewer GUI)
npm run prisma:studio
```

Run local dev server with auto-reload:
```bash
npm run dev
```

Build production bundle:
```bash
npm run build
```

Run tests:
```bash
# Run unit & integration tests
npm run test

# Run tests in watch mode
npm run test:watch
```
