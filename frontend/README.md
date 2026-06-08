# AcceleratorX CMS Frontend

Welcome to the frontend application for the **AcceleratorX Course & Cohort Management System (CMS)**. This project is a real-time chat, moderation, and cohort management application built with **React**, **TypeScript**, **Tailwind CSS**, and **Vite**.

It supports standalone execution as well as secure, embedded Single Sign-On (SSO) integration within a parent Learning Management System (LMS) iframe.

---

## 🚀 Key Features

- **Real-Time Communication**:
  - **Channel Chat**: Group discussion rooms associated with specific cohorts/batches.
  - **Direct Messages (DMs)**: Private 1-to-1 conversations between students, mentors, and admins.
  - **Real-Time Indicators**: Live typing indicators, user online status indicators, and toast notifications powered by Socket.io.
- **Embedded SSO Integration**:
  - Seamlessly integrates inside a parent LMS frame using a custom secure postMessage bridge.
  - Silent SSO authentication with automatic, single-flight token refresh handling.
- **Roles & Permissions Control**:
  - Route guards for role-based views (e.g., `/admin`, `/mentor`).
  - **Admin Panel**: Batch creation, user moderation queue, cohort membership control, and course subscription configuration.
- **State Management & Querying**:
  - Built with **Zustand** for lightweight local and global store management (auth, sockets, DMs, batches, ui).
  - Built with **TanStack React Query** for robust, cached API requests.

---

## 🛠️ Tech Stack

- **Core**: React 18, TypeScript, React Router DOM v6
- **Styling**: Tailwind CSS, PostCSS
- **State Management**: Zustand
- **Data Fetching**: Axios, TanStack React Query v5
- **Real-time Engine**: Socket.io Client
- **Validation**: Zod
- **Build Tool**: Vite

---

## 📂 Project Structure

```text
frontend/
├── src/
│   ├── api/          # Axios HTTP client interceptors (token injection, auto-refresh)
│   ├── components/   # Shared UI components (AppShell, Modal, FormField, ThemeToggle)
│   ├── embed/        # Iframe postMessage bridge and SSO authentication hooks
│   ├── hooks/        # Custom react hooks (Socket init, Event handlers)
│   ├── pages/        # Route pages (Admin, Cohorts/Batches, Chat Channels, DMs, Login)
│   ├── store/        # Zustand global state stores
│   ├── App.tsx       # Main routing, role guards, and App Shell integration
│   ├── main.tsx      # App mounting point and providers
│   └── index.css     # Styling entry point (Tailwind & custom variables)
├── public/           # Static assets
├── .env.example      # Environment variables template
├── tailwind.config.js# Tailwind CSS custom theme settings
└── tsconfig.json     # TypeScript configuration
```

---

## ⚙️ Setup & Installation

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18 or higher) and [npm](https://www.npmjs.com/) installed.

### 2. Install Dependencies
Clone this repository and run the following command in the `frontend` folder:
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root of the `frontend` directory:
```bash
cp .env.example .env
```

Configure the values as per your setup:
```env
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000

# LMS origin(s) allowed to embed this app in an iframe (space/comma separated).
# Used by vite.config.ts to send the `frame-ancestors` CSP header in dev/preview.
# In production, set the same value on your static host (e.g., Vercel, Nginx).
FRAME_ANCESTORS=http://localhost:3000
```

---

## 💻 Running the Project

### Start Development Server
```bash
npm run dev
```
The app will run locally at `http://localhost:5173` (or the next available port).

### Build for Production
To build the application for production, compile the TypeScript code and bundle the assets:
```bash
npm run build
```
The output files will be generated in the `dist` directory.

### Preview Production Build
```bash
npm run preview
```

### Linting
```bash
npm run lint
```
