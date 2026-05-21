# Acme Learning Chat Platform — Production Deployment Guide

This guide outlines the production deployment architecture, configuration checklists, and options for deploying the **Acme Learning Chat Platform** (React/Vite Frontend + Node/Express Backend + PostgreSQL + Socket.IO + optional Redis).

---

## 🏗️ Production Architecture Overview

The application consists of three primary layers:
1. **Frontend (Vite / React)**: Compiled to optimized static assets (HTML, JS, CSS) served via a Content Delivery Network (CDN) or a reverse proxy like Nginx.
2. **Backend (Node.js / Express)**: Runs compiled TypeScript (ESM) using a process manager like **PM2** or inside a Docker container.
3. **Data Stores**:
   - **PostgreSQL**: Stateful SQL database storing users, messages, permissions, and logs.
   - **Redis**: In-memory cache for rate-limiting. (The system will automatically fall back to memory if Redis is unavailable, but Redis is highly recommended for production scale).

### Critical Considerations for Production
* **WebSockets (Socket.IO)**: Requires a persistent HTTP/HTTPS connection. High-scale or clustered deployments must support **sticky sessions** if using multiple backend instances.
* **Local Uploads**: The application uses `multer` to write uploaded files to `./uploads` locally. For multi-instance or serverless deployments, you must use a persistent volume or mount, or configure a cloud storage adapter (e.g., AWS S3).

---

## 📋 Production Environment Variables Checklist

Ensure these variables are correctly configured in your hosting environment.

### Backend (`backend/.env`)

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL Connection string | `postgresql://db_user:db_password@your-db-host:5432/cms_prod?sslmode=require` |
| `REDIS_URL` | Redis server connection string | `redis://:your_password@your-redis-host:6379` |
| `JWT_ACCESS_SECRET` | Cryptographically secure random string | *Generate with `openssl rand -hex 64`* |
| `JWT_REFRESH_SECRET`| Cryptographically secure random string | *Generate with `openssl rand -hex 64`* |
| `JWT_ACCESS_EXPIRES`| Expiration window for access token | `15m` |
| `JWT_REFRESH_EXPIRES`| Expiration window for refresh token | `7d` |
| `PORT` | Listening port for the Express application | `5000` |
| `CLIENT_ORIGIN` | Allowed CORS origin (production frontend URL) | `https://chat.yourdomain.com` |
| `UPLOAD_DIR` | Absolute path or relative folder for file storage | `/var/www/cms/backend/uploads` |
| `CRM_INTEGRATION_KEY`| Unique key matching CRM API requests | *Generate secure token* |
| `CRM_BASE_URL` | Base URL of the integrated CRM system | `https://crm.yourdomain.com` |

### Frontend (`frontend/.env`)

| Variable | Description | Recommended Value |
| :--- | :--- | :--- |
| `VITE_API_URL` | Full endpoint path for REST requests | `https://api.yourdomain.com/api` (or `/api` if co-located) |
| `VITE_SOCKET_URL` | Full path for WebSockets (Socket.IO) | `https://api.yourdomain.com` (or `/` if co-located) |

---

## 🚀 Deployment Option 1: Docker & Docker Compose (Recommended)

Using **Docker Compose** is the most reliable method for VPS deployments because it guarantees identical environments for Node.js, Prisma, PostgreSQL, and Redis, and automatically links them.

### 1. Structure in Project Root
Create a `Dockerfile.backend` and `docker-compose.yml` in the root of the project.

#### `Dockerfile.backend` (Create in `/backend/Dockerfile`)
```dockerfile
# Build Stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# Run Stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
EXPOSE 5000
CMD ["npm", "run", "start"]
```

#### `docker-compose.yml` (Create in `/docker-compose.yml`)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: cms-postgres
    restart: always
    environment:
      POSTGRES_USER: cms_user
      POSTGRES_PASSWORD: secure_password_here
      POSTGRES_DB: cms_production
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    container_name: cms-redis
    restart: always
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: cms-backend
    restart: always
    environment:
      DATABASE_URL: postgresql://cms_user:secure_password_here@postgres:5432/cms_production?schema=public
      REDIS_URL: redis://redis:6379
      PORT: 5000
      JWT_ACCESS_SECRET: secure_access_secret_here
      JWT_REFRESH_SECRET: secure_refresh_secret_here
      JWT_ACCESS_EXPIRES: 15m
      JWT_REFRESH_EXPIRES: 7d
      CLIENT_ORIGIN: https://chat.yourdomain.com
      UPLOAD_DIR: ./uploads
    volumes:
      - backend_uploads:/app/uploads
    ports:
      - "5000:5000"
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  backend_uploads:
```

### 2. Deploy Command
Run the stack using:
```bash
docker-compose up -d --build
```
Apply migrations inside the backend container:
```bash
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend npx prisma db seed
```

---

## ☁️ Deployment Option 2: Modern PaaS (Railway / Render / Fly.io)

PaaS providers make deploying full-stack Node.js + DB apps extremely simple.

### 🌟 Deploying the Backend on Render
1. **Create PostgreSQL & Redis**:
   - In Render, click **New** -> **PostgreSQL**.
   - Copy the internal connection URL.
   - Click **New** -> **Redis**. Copy the internal URL.
2. **Create a Web Service for the Backend**:
   - Connect your GitHub repository.
   - Select the directory `/backend`.
   - Set Environment to **Node**.
   - Build Command: `npm install && npx prisma generate && npm run build`
   - Start Command: `npx prisma migrate deploy && npm run start`
   - Add the required environment variables (from the table above), linking `DATABASE_URL` and `REDIS_URL` to your created DB/Redis instances.
3. **Mount Storage**:
   - In the Web Service settings, add a **Disk** to mount at `/app/uploads` to persist uploaded files permanently.

### 🌟 Deploying the Frontend on Vercel

Since the frontend is a React + Vite SPA, it is entirely static and perfect for **Vercel**. Deploying it to Vercel provides instant worldwide CDN delivery and auto-deployments on every Git push.

We have already pre-configured a `frontend/vercel.json` file in your workspace to handle React Router single-page application routing and prevent `404 Not Found` errors when refreshing subpages.

#### Step-by-Step Vercel Deployment:
1. Push your project to a GitHub, GitLab, or Bitbucket repository.
2. Go to [Vercel Dashboard](https://vercel.com) and click **Add New** -> **Project**.
3. Import your repository.
4. Configure the project settings:
   - **Root Directory**: Select `frontend` (crucial so Vercel builds only the React app).
   - **Framework Preset**: Select **Vite** (Vercel will auto-populate the build command `npm run build` and output directory `dist`).
5. Open the **Environment Variables** section and add:
   - `VITE_API_URL` = `https://your-backend.com/api` (the URL of your deployed Express backend)
   - `VITE_SOCKET_URL` = `https://your-backend.com`
6. Click **Deploy**.

> [!WARNING]
> **Can I host the Express Backend on Vercel?**
> **No, you should not deploy this backend on Vercel.** 
> Vercel runs on **Serverless Functions** (AWS Lambda underneath). Serverless environments have an execution timeout (typically 10 to 60 seconds) and spin down when idle. 
> * **WebSockets (Socket.IO)**: Require a persistent, long-lived TCP connection to sync chats in real-time. A serverless function will close the WebSocket connection after a few seconds.
> * **File Uploads**: Serverless functions have a read-only filesystem (except a temporary `/tmp` directory that gets deleted between requests). Your uploaded avatars and files would disappear immediately.
> 
> **Recommended Stacking**: Host your static frontend on **Vercel** and your stateful backend on **Render**, **Railway**, **Fly.io**, or a **VPS (DigitalOcean/AWS)**.


---

## 🖥️ Deployment Option 3: Manual VPS Deployment (Ubuntu + Nginx + PM2)

For maximum control, cost-efficiency, and bare-metal performance.

### Step 1: Install Node.js, Postgres, Redis, and Nginx
```bash
# Add NodeSource repository for Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql redis-server nginx

# Ensure Redis and Postgres are running
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### Step 2: Configure PostgreSQL
```bash
sudo -i -u postgres psql
# In Postgres shell:
CREATE DATABASE cms_prod;
CREATE USER cms_admin WITH PASSWORD 'supersecretpassword';
GRANT ALL PRIVILEGES ON DATABASE cms_prod TO cms_admin;
\q
```

### Step 3: Clone Code and Setup Backend
Clone your code to `/var/www/cms` and build the backend.
```bash
cd /var/www/cms/backend
cp .env.example .env
# Update .env using nano (add secure values, ports, and database urls)
nano .env

# Install dependencies and build
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
```

### Step 4: Run Backend with PM2 Process Manager
PM2 ensures the Node process automatically restarts upon crashes or server reboots.
```bash
sudo npm install -g pm2
pm2 start dist/index.js --name "cms-backend" --node-args="--import=tsx"
pm2 save
pm2 startup
```

### Step 5: Build and Deploy Frontend
Build static files of React app and let Nginx serve it.
```bash
cd /var/www/cms/frontend
# Ensure .env has the correct backend domain
nano .env
npm install
npm run build
```
Copy build files or configure Nginx root to point to `/var/www/cms/frontend/dist`.

### Step 6: Configure Nginx as Static Host & WebSocket Reverse Proxy
Nginx acts as the gatekeeper, serving static assets, handling SSL termination, and proxying HTTP & WebSocket traffic to your Node.js backend.

Create a site file `/etc/nginx/sites-available/cms`:
```nginx
server {
    listen 80;
    server_name yourdomain.com api.yourdomain.com;
    return 301 https://$host$request_uri; # Redirect HTTP to HTTPS
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL configuration (e.g. from Let's Encrypt / Certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Front-end static site
    root /var/www/cms/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Backend uploads folder
    location /uploads/ {
        alias /var/www/cms/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # REST endpoints
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.IO endpoints (Crucial upgrade headers)
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable configuration and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/cms /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Use **Certbot** to automatically request and install SSL certificates for your domain:
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

---

## 🛠️ Post-Deployment Verification

Verify that deployment succeeded by executing these checks:
1. **Frontend Assets**: Visit `https://yourdomain.com`. Verify pages load and routing does not throw 404s when refreshed.
2. **API Communication**: Check `https://api.yourdomain.com/api/auth/profile`. Ensure it yields JSON response (401 Unauthorized is expected, not 502 Bad Gateway).
3. **WebSockets connection**: Open browser developer console, go to **Network** -> **WS** tab. Verify the connection to `/socket.io/` transitions to green (101 Switching Protocols) and starts exchanging frames (ping/pong, subscriptions).
4. **File Storage permissions**: Upload an avatar or file. Verify the file appears in `/backend/uploads` and displays in frontend. Ensure the user's OS has sufficient file permissions (e.g. `chmod -R 755 uploads` for the process user).

---

## 🧪 Staging & Testing Deployments (Local Sandbox & External Testing)

Before shipping to full production, you should test the production-compiled version locally or expose it temporarily for remote testers or external API integrations (like CRM, LMS, or transactional email/OTP webhooks).

### 1. Local Staging Simulation (Testing the Production Build Locally)
To test production-level build performance without a VPS:

```bash
# 1. Compile the production frontend
cd frontend
npm run build

# 2. Preview the built assets on your local network
npm run preview -- --host 0.0.0.0 --port 4173
```
*Note the local IP address printed in the console (e.g., `http://192.168.1.15:4173`). Use this to configure your backend `.env` variables:*
* Set `CLIENT_ORIGIN=http://192.168.1.15:4173` in `backend/.env`.
* Set `VITE_API_URL=http://192.168.1.15:5000/api` and `VITE_SOCKET_URL=http://192.168.1.15:5000` in `frontend/.env` before running `npm run build`.
* Run the backend on the same network using `npm run start`. You can now open the app on your mobile phone or another device connected to the same Wi-Fi.

---

### 2. Tunneling with `ngrok` for Remote Staging & Webhook Testing
If you are testing integrations like the **LMS API**, **CRM Callback**, or **Brevo/WhatsApp OTP gateways**, these external platforms need a public URL to talk back to your backend.

1. **Install ngrok** (if not already installed) on your local system.
2. **Tunnel the Backend (Port 5000)**:
   ```bash
   ngrok http 5000
   ```
   *Copy the generated secure URL (e.g., `https://xxxx-xx-xx.ngrok-free.app`).*
3. **Tunnel the Frontend Preview (Port 4173)**:
   ```bash
   ngrok http 4173
   ```
   *Copy the generated secure URL (e.g., `https://yyyy-yy-yy.ngrok-free.app`).*
4. **Update Env Configurations**:
   * **In `backend/.env`**: Set `CLIENT_ORIGIN=https://yyyy-yy-yy.ngrok-free.app` (allow CORS from frontend tunnel).
   * **In `frontend/.env`**: Set `VITE_API_URL=https://xxxx-xx-xx.ngrok-free.app/api` and `VITE_SOCKET_URL=https://xxxx-xx-xx.ngrok-free.app` (send requests to backend tunnel).
   * Re-run `npm run build` inside `/frontend` and restart `npm run preview`.

---

### 3. Rapid Testing Cycles & Database Resets
When iterating on features in staging/testing:
* **Prisma Studio**: Monitor users, subscription tiers, batch memberships, and messages visually:
  ```bash
  cd backend
  npx prisma studio
  ```
* **Full Database Reset**: Clean out mock chats and rebuild/re-seed the DB instantaneously:
  ```bash
  cd backend
  npx prisma migrate reset --force
  npx prisma db seed
  ```
* **Bypassing Nginx SSL for Local Testing**:
  If testing Nginx configuration on a local machine (e.g. WSL/VM) without active Let's Encrypt certificates:
  - Replace `listen 443 ssl http2;` with `listen 80;`.
  - Remove all lines starting with `ssl_certificate` and `ssl_certificate_key`.
  - Test routing over basic HTTP.

