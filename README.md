# WhatsApp Ordering System

A full-stack WhatsApp-based ordering system for small Pakistani merchants. No bots, no automation — just wa.me deep links.

## Tech Stack

- **Frontend**: React 18, Vite 5, Tailwind CSS 3, React Router 6, Socket.io Client
- **Backend**: Node.js 20+, Express, Socket.io Server, node-cron, bcrypt, JWT, QRCode
- **Database**: PostgreSQL (raw SQL via `pg`)
- **Deployment**: Vercel (frontend), Railway/Render (backend)

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm

### 1. Database Setup

```bash
# Create the database
createdb whatsapp_ordering

# Or via psql
psql -U postgres -c "CREATE DATABASE whatsapp_ordering;"
```

### 2. Server Setup

```bash
cd server
cp .env.example .env
# Edit .env with your database credentials
npm install
npm run dev
```

The server starts on **http://localhost:3001**. The database schema auto-migrates on startup.

### 3. Client Setup

```bash
cd client
npm install
npm run dev
```

The client starts on **http://localhost:5173** with API proxy to port 3001.

### 4. (Optional) Supabase Storage — for product image uploads

The app supports both manual image URLs and direct image uploads via Supabase Storage. Upload is the recommended default.

1. Create a project at [supabase.com](https://supabase.com)
2. In the Supabase dashboard, go to **Storage** → create a new bucket named `product-images` with public access
3. In **Project Settings → API**, copy your Project URL and **service_role** key
4. Add to `server/.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

5. In Supabase **Storage → Policies**, create a policy on the `product-images` bucket:
   - **SELECT**: Allow public read (`true`)
   - **INSERT**: Allow authenticated writes (no policy needed, the server uses the service role)

Without Supabase configured, merchants can still paste image URLs — direct upload will be unavailable.

## Default Configuration

- **Cron job**: Checks orders every 5 minutes for expiry (60 min) and reminders (~30 min)
- **Business hours**: Default 9 AM to 9 PM daily. Configurable per-store.
- **Rate limiting**: 3 orders/hour per phone number, 5 login attempts/hour per IP

## Project Structure

```
whatsapp-ordering/
├── client/                    # React SPA (Vercel)
│   ├── src/
│   │   ├── api/              # API client functions
│   │   ├── components/       # Shared UI components
│   │   ├── context/          # AuthContext, CartContext
│   │   ├── hooks/            # useSocket
│   │   ├── pages/
│   │   │   ├── auth/         # Login, Register
│   │   │   ├── dashboard/    # Dashboard, Orders, Products, Settings
│   │   │   └── public/       # StoreFront, OrderConfirmation
│   │   └── utils/            # Formatting, validation, socket client
│   ├── vercel.json
│   └── package.json
├── server/                    # Express API + Socket.io (Railway)
│   ├── src/
│   │   ├── db/               # Schema, pool, migration
│   │   ├── middleware/        # auth, validate, rateLimit, errorHandler
│   │   ├── routes/           # auth, store, orders, dashboard
│   │   ├── socket/           # Socket.io with JWT auth + room isolation
│   │   ├── cron/             # Order expiry/reminder (5-min interval)
│   │   └── utils/            # JWT, QR code, WhatsApp deep links
│   ├── Procfile
│   └── package.json
└── ARCHITECTURE.md
```

## API Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | - | Create store |
| POST | `/api/auth/login` | - | Login (sets JWT cookie) |
| POST | `/api/auth/logout` | - | Clear session |
| GET | `/api/auth/me` | JWT | Get current store |
| GET | `/api/store/:slug` | - | Public store info + hours |
| GET | `/api/store/:slug/products` | - | Public product list |
| POST | `/api/store/:slug/orders` | - | Place order (rate limited) |
| GET | `/api/orders/:orderId?token=` | Token | Verify order |
| POST | `/api/orders/:orderId/confirm?token=` | Token | Confirm order |
| POST | `/api/orders/:orderId/cancel?token=` | Token | Cancel order |
| GET | `/api/dashboard/orders` | JWT | List orders |
| POST | `/api/dashboard/orders/:id/accept` | JWT | Accept order |
| POST | `/api/dashboard/orders/:id/complete` | JWT | Complete order |
| POST | `/api/dashboard/orders/:id/cancel` | JWT | Cancel order |
| GET/POST/PUT/DELETE | `/api/dashboard/products` | JWT | Product CRUD |
| GET/PUT | `/api/dashboard/settings` | JWT | Store settings |
| GET/PUT | `/api/dashboard/business-hours` | JWT | Business hours |
| GET | `/api/dashboard/qrcode` | JWT | Store QR code |
| GET | `/api/dashboard/stats` | JWT | Order statistics |

## Order Lifecycle

```
Checkout → Confirmation_Pending → customer confirms → Pending
                                 → 60 min timeout   → Expired
                                 → customer cancels  → Cancelled

Pending → merchant accepts → Confirmed → Complete
        → merchant cancels → Cancelled
```

## Security Features

- **Passwords**: bcrypt with 12 salt rounds
- **JWT**: httpOnly, secure, sameSite=none (production) / lax (development) cookies
- **No localStorage** for sensitive data
- **Store isolation**: Every dashboard query includes `WHERE store_id = $1`
- **Price lock-in**: Product prices stored in `order_items.unit_price` at order time
- **Rate limiting**: Per-phone for orders, per-IP for auth
- **Race conditions**: Conditional UPDATE `WHERE status = 'X'` prevents double-processing
- **Input sanitization**: XSS filtering on all text inputs
- **SQL injection**: Parameterized queries throughout
- **Helmet**: Security headers on all responses

## Deployment

### Frontend (Vercel)

```bash
cd client

# Deploy to Vercel
vercel --prod

# Then set environment variables in Vercel dashboard:
# - VITE_API_URL: https://your-backend.railway.app
# - VITE_SOCKET_URL: https://your-backend.railway.app
```

Vercel will auto-detect the Vite framework. The `vercel.json` handles SPA fallback routing.

### Backend (Railway)

```bash
cd server

# Deploy to Railway
# Connect your GitHub repo or use Railway CLI
railway up
```

Set the following environment variables in the Railway dashboard:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string from Railway Postgres plugin |
| `JWT_SECRET` | Yes | 64+ character random string |
| `FRONTEND_URL` | Yes | Frontend URL (e.g. `https://your-store.vercel.app`) |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | No | Railway sets this automatically |

**Important**: Railway injects `PORT` automatically — don't set it manually.

### Database

Railway provides PostgreSQL as a plugin. No separate database host needed.

### Cookie & CORS Configuration

The app uses `sameSite: 'none'` + `secure: true` cookies in production to support cross-origin requests between Vercel (frontend) and Railway (backend). This requires HTTPS, which both platforms provide by default.

For local development, cookies use `sameSite: 'lax'` and don't require HTTPS.
