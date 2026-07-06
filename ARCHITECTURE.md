# WhatsApp Ordering System — Complete Architecture

> **Status**: Final Design (pre-implementation)
> **Date**: 2026-07-02
> **Deployment**: Vercel (frontend), Railway/Render (backend)

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  CUSTOMER BROWSER                      MERCHANT BROWSER          │
│  ┌──────────────────┐                ┌──────────────────┐        │
│  │ React SPA         │                │ React SPA         │        │
│  │ Port 5173 (dev)   │                │ Port 5173 (dev)   │        │
│  └────────┬─────────┘                └────────┬──────────┘        │
│           │ HTTP/JSON                         │ HTTP/JSON         │
│           │ Socket.io (read-only)              │ Socket.io (emit) │
└───────────┼───────────────────────────────────┼───────────────────┘
            │                                   │
            ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER (Port 3001)                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Middleware Stack                                         │   │
│  │  helmet → cors → rate-limiter → auth → validate → router │   │
│  └──────────────────────────────────────────────────────────┘   │
│                     │                    │                       │
│  ┌──────────────────▼────┐  ┌───────────▼─────────────┐        │
│  │  REST API Routes      │  │  Socket.io Server        │        │
│  │  /api/...             │  │  Rooms by store_id       │        │
│  └───────────────────────┘  └─────────────────────────┘        │
│                     │                                           │
│  ┌──────────────────▼────┐                                      │
│  │  node-cron (5 min)    │                                      │
│  │  Order expiry/reminder│                                      │
│  └───────────────────────┘                                      │
└───────────────────┬─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL                                    │
│  stores ──┐                                                      │
│  products │── orders ── order_items                               │
│  business_hours                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: Order Lifecycle

```
Customer submits checkout
        │
        ▼
Order created (status: Confirmation_Pending)
secure_token + sequential order_id generated
        │
        ├──► Frontend redirects to wa.me deep link
        │    (customer manually sends to merchant)
        │
        ▼
Customer/merchant opens /confirm/:orderId?token=...
        │
        ├──► Customer clicks "Confirm"
        │    └──► Status → Pending
        │         └──► Socket.io → merchant dashboard (real-time)
        │              └──► Merchant clicks "Accept" → Confirmed
        │                   └──► Merchant clicks "Complete" → Completed
        │
        ├──► Customer clicks "Cancel"
        │    └──► Status → Cancelled
        │         └──► wa.me link with cancellation message
        │
        ├──► cron fires after 60 mins (no action)
        │    └──► Status → Expired
        │
        └──► cron fires at ~30 mins (if not confirmed)
             └──► Sets reminder_sent_at = NOW()
```

---

## 2. Complete Folder Structure

```
whatsapp-ordering/
│
├── client/                              # React + Vite (Vercel deployment unit)
│   ├── public/
│   │   └── favicon.ico
│   ├── src/
│   │   ├── api/
│   │   │   └── index.js                 # All API calls (axios-based)
│   │   ├── components/
│   │   │   ├── LoadingSpinner.jsx       # Reusable spinner
│   │   │   ├── ErrorMessage.jsx         # Human-readable error display
│   │   │   ├── ProtectedRoute.jsx       # JWT guard wrapper
│   │   │   └── EmptyState.jsx           # "No items" state
│   │   ├── pages/
│   │   │   ├── public/
│   │   │   │   ├── StoreFront.jsx       # /store/:slug — product grid + cart + checkout
│   │   │   │   ├── OrderConfirmation.jsx # /confirm/:orderId — confirm/cancel
│   │   │   │   └── OrderStatusPage.jsx  # Already-confirmed / expired pages
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.jsx
│   │   │   │   └── RegisterPage.jsx
│   │   │   └── dashboard/
│   │   │       ├── DashboardLayout.jsx  # Nav + header + outlet
│   │   │       ├── DashboardHome.jsx    # Order feed + live updates
│   │   │       ├── OrderCard.jsx        # Individual order display
│   │   │       ├── ProductManagement.jsx # CRUD products
│   │   │       ├── StoreSettings.jsx    # Settings form
│   │   │       └── BusinessHoursEditor.jsx # Business hours config
│   │   ├── context/
│   │   │   ├── CartContext.jsx          # Cart state provider
│   │   │   └── AuthContext.jsx          # Auth state provider
│   │   ├── hooks/
│   │   │   └── useSocket.js            # Socket.io connection hook
│   │   ├── utils/
│   │   │   ├── formatCurrency.js       # PKR formatting
│   │   │   ├── validatePhone.js        # Pakistani phone validation
│   │   │   ├── socket.js               # Socket.io client instance
│   │   │   └── isStoreOpen.js          # Business hours check (client-side)
│   │   ├── App.jsx                     # Router setup
│   │   ├── main.jsx                    # Entry point with providers
│   │   └── index.css                   # Tailwind imports + base styles
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vercel.json                     # Vercel deployment config
│   └── package.json
│
├── server/                              # Express + Socket.io (Railway deployment unit)
│   ├── src/
│   │   ├── index.js                    # Server entry, Express + Socket.io bootstrap
│   │   ├── config.js                   # Environment config (validated)
│   │   ├── db/
│   │   │   ├── pool.js                 # pg Pool with SSL config for production
│   │   │   ├── migrate.js             # Auto-run schema on startup
│   │   │   └── schema.sql             # Full schema (stores, products, orders, order_items, business_hours)
│   │   ├── middleware/
│   │   │   ├── auth.js                # JWT verification → req.merchant
│   │   │   ├── rateLimit.js           # In-memory rate limiter (3/60min per phone)
│   │   │   ├── validate.js            # Input validation + sanitization
│   │   │   ├── errorHandler.js        # Global error handler (no stack in prod)
│   │   │   └── storeAccess.js         # Ensures dashboard queries are scoped to req.merchant.store_id
│   │   ├── routes/
│   │   │   ├── auth.js                # /api/auth/*
│   │   │   ├── store.js               # /api/store/:slug/*
│   │   │   ├── orders.js              # /api/orders/* (public confirmation endpoints)
│   │   │   └── dashboard.js           # /api/dashboard/* (protected, all merchant ops)
│   │   ├── socket/
│   │   │   └── index.js              # Socket.io init + room management
│   │   ├── cron/
│   │   │   └── orderExpiry.js        # 5-min cron: expiry + reminder logic
│   │   └── utils/
│   │       ├── jwt.js                # signJwt() / verifyJwt()
│   │       ├── waLink.js             # buildWaDeepLink(phone, text)
│   │       └── qrCode.js             # generateQrCode(text)
│   ├── package.json
│   ├── .env.example
│   └── Procfile                      # Railway start command
│
├── .gitignore
├── README.md
└── ARCHITECTURE.md                   # This file
```

---

## 3. Database Schema (Enhanced)

### Tables

```sql
-- Stores (merchant accounts)
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  whatsapp_number VARCHAR(20) NOT NULL,
  allow_delivery BOOLEAN DEFAULT TRUE,
  allow_pickup BOOLEAN DEFAULT TRUE,
  delivery_fee DECIMAL(10,2) DEFAULT 0.00,
  free_delivery_threshold DECIMAL(10,2),
  pickup_address TEXT,
  pickup_instructions TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  secure_token UUID DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  customer_name VARCHAR(100) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  fulfillment_method VARCHAR(20) CHECK (fulfillment_method IN ('delivery', 'pickup')),
  delivery_address TEXT,
  order_status VARCHAR(20) DEFAULT 'Confirmation_Pending'
    CHECK (order_status IN ('Confirmation_Pending','Pending','Cancelled','Expired','Confirmed','Completed')),
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) DEFAULT 0.00,
  total DECIMAL(10,2) NOT NULL,
  confirmation_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order items (line items with price lock-in)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(150) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL
);

-- Business hours (per day of week per store)
CREATE TABLE business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  UNIQUE(store_id, day_of_week)
);

-- Indexes for performance
CREATE INDEX idx_orders_store_id ON orders(store_id);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX idx_products_store_id ON products(store_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_business_hours_store_id ON business_hours(store_id);
```

### Design Decisions for order_items.product_name
- **Added `product_name` column** to `order_items` (not in original spec). When creating an order, we store the product's current name alongside the locked price. This ensures that if the merchant later renames or deletes a product, past order items still display the correct name. Without this, deleting a product (via ON DELETE CASCADE) would leave orphaned order_items with no name to display.
- **product_id uses ON DELETE SET NULL** (not CASCADE) to preserve historical order data if a product is deleted.

### Entity Relationships (Text Diagram)

```
stores 1 ────── N products        # One store has many products
stores 1 ────── N orders          # One store has many orders
stores 1 ────── N business_hours  # One store has 7 business hour rows
orders 1 ────── N order_items     # One order has many line items
products 1 ──── N order_items     # One product appears in many order items
                                   # (but product deletion sets FK to NULL)
```

---

## 4. API Route List

### Public Routes (no auth)

| Method | Path | Purpose | Rate Limited? |
|--------|------|---------|---------------|
| `GET` | `/api/store/:slug` | Get store info + products + open status | No |
| `GET` | `/api/store/:slug/products` | Get store's products | No |
| `POST` | `/api/store/:slug/orders` | Create order | Yes (3/hr/phone) |
| `GET` | `/api/orders/:orderId` | Get order by ID (requires `?token=`) | No |
| `POST` | `/api/orders/:orderId/confirm` | Confirm order (requires `?token=`) | No |
| `POST` | `/api/orders/:orderId/cancel` | Cancel order (requires `?token=`) | No |

### Auth Routes

| Method | Path | Purpose | Rate Limited? |
|--------|------|---------|---------------|
| `POST` | `/api/auth/register` | Register new store | Yes (3/hr/IP) |
| `POST` | `/api/auth/login` | Login, set JWT cookie | Yes (5/hr/IP) |
| `POST` | `/api/auth/logout` | Clear JWT cookie | No |
| `GET` | `/api/auth/me` | Get current merchant info | No |

### Protected Dashboard Routes (JWT required)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/dashboard/orders` | List store's orders (query: status filter) |
| `GET` | `/api/dashboard/orders/:orderId` | Get single order with items |
| `POST` | `/api/dashboard/orders/:orderId/accept` | Accept → Confirmed |
| `POST` | `/api/dashboard/orders/:orderId/complete` | Complete → Completed |
| `POST` | `/api/dashboard/orders/:orderId/cancel` | Cancel → Cancelled |
| `GET` | `/api/dashboard/products` | List all products |
| `POST` | `/api/dashboard/products` | Create product |
| `PUT` | `/api/dashboard/products/:productId` | Update product |
| `DELETE` | `/api/dashboard/products/:productId` | Delete product |
| `GET` | `/api/dashboard/settings` | Get store settings |
| `PUT` | `/api/dashboard/settings` | Update store settings |
| `GET` | `/api/dashboard/business-hours` | Get business hours |
| `PUT` | `/api/dashboard/business-hours` | Update business hours |
| `GET` | `/api/dashboard/qrcode` | Generate QR code (returns JSON with data URL) |
| `GET` | `/api/dashboard/stats` | Order statistics (today, pending, etc.) |

---

## 5. Socket Event List

### Connection Authentication
- Client connects with `auth: { token }` in Socket.io handshake
- Server verifies JWT, extracts store_id
- On invalid token, connection is rejected (middleware)

### Events: Client → Server

| Event | Payload | Purpose |
|-------|---------|---------|
| `join-store` | `{ storeId: string }` | Merchant joins room for their store |
| `leave-store` | `{ storeId: string }` | Merchant leaves room |

### Events: Server → Client

| Event | Payload | When |
|-------|---------|------|
| `new-order` | `{ order: OrderObject }` | When a new order is placed (Confirmation_Pending) |
| `order-status-changed` | `{ orderId, oldStatus, newStatus }` | When any order status changes |
| `order-confirmed` | `{ order: OrderObject }` | When customer confirms (→Pending) — specialized for chime |

### Room Keying
- Room name: `store:{store_id}`
- Merchant automatically joined on connect (from JWT)
- Never broadcast outside the room

---

## 6. Security Plan

### Layer 1: Transport Security
- HTTPS enforced in production (Vercel/Railway provide this)
- `helmet` middleware sets security headers (X-Frame-Options, X-Content-Type-Options, etc.)

### Layer 2: Authentication
- **Password**: bcrypt, salt rounds 12
- **JWT**: httpOnly, secure, sameSite=strict cookies
- **JWT expiry**: 7 days (configurable)
- **JWT payload**: `{ storeId, slug }` — minimal data, no sensitive info

### Layer 3: Authorization
- **Store isolation**: Every dashboard query has `WHERE store_id = $storeId` parameterized with the JWT's store_id. Never trust client-supplied store_id in dashboard routes.
- **Order confirmation**: Token-based auth (query parameter `token` must match DB `secure_token`). No JWT required for public confirmation flow.

### Layer 4: Input Validation
- All text inputs: trimmed, length-checked, regex-sanitized
- Phone numbers: Pakistani format validated (`+92XXXXXXXXXX` or `03XXXXXXXXX`)
- Prices/numbers: parsed to decimal, range-checked
- SQL: parameterized queries everywhere (pg prepared statements)
- XSS: all user-provided text is escaped on output (React does this by default)

### Layer 5: Rate Limiting
- **Order creation**: 3 per phone number per 60 minutes (in-memory Map)
- **Auth endpoints**: 5 per IP per hour (separate in-memory Map)
- Limits reset on server restart (acceptable for MVP)

### Layer 6: Business Logic Security
- **Price integrity**: At order creation, products' prices are read from DB and stored in `order_items.unit_price`. Never recalculated from live products table.
- **Confirm/Cancel idempotency**: Status transitions use `UPDATE ... WHERE order_id = X AND order_status = 'Confirmation_Pending'`, returning affected rows. If 0 rows affected, status had already changed → reject with appropriate message.
- **Race condition**: The cron expiry and customer confirm use the same conditional update pattern. Both check current status inside the UPDATE WHERE clause.

### Layer 7: Cookie Security
```js
res.cookie('token', jwt, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/'
});
```

### Layer 8: CORS
- Only allow the frontend origin
- No credentials exposure to unauthorized origins

---

## 7. Risk Analysis

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **WhatsApp dependency**: Customer must manually send the message | Medium | Clear UI instructions. The wa.me link is pre-filled. If it fails, customer can copy-paste the URL. |
| 2 | **Token in URL exposed via referrer headers**: WhatsApp, browser history, proxy logs | High | Acceptable per spec. Tokens are UUIDs (unguessable, no sensitive data). No PII in token. Consider adding `rel="noreferrer"` on all links. |
| 3 | **Cron race condition**: Customer confirms at same second cron expires | Medium | Conditional UPDATE `WHERE status = 'Confirmation_Pending'` in both paths. Only one wins. Losing path gets 0 affected rows. |
| 4 | **Rate limit by server restart**: In-memory state lost | Low | Acceptable for MVP. Can migrate to Redis or DB-backed in future. |
| 5 | **No database migration system**: schema.sql is hand-run or auto-run | Medium | `migrate.js` checks if tables exist before creating. Idempotent with IF NOT EXISTS. Not a full migration framework but sufficient. |
| 6 | **Image URLs**: Merchant provides broken/malicious URL | Low | Image URLs stored as text. No proxy. The `<img>` tag's browser security isolates this. |
| 7 | **No payment processing**: Orders are placed without payment | Low | By design. Pakistani small merchants commonly use cash-on-delivery or bank transfer. |
| 8 | **Merchant deletes product in active cart**: Customer may have it in cart | Low | Cart is client-side session. Product quantity check at checkout time will fail. Provide clear error message. |
| 9 | **Phone number validation**: Multiple formats in Pakistan | Medium | Strip spaces, dashes, accept both `+92` and `03` prefixes. Normalize to a standard format. |
| 10 | **No SMS/call verification for customer**: Anyone can place order with any phone | Medium | Acceptable by design. This is a trust-based system for small merchants. The WhatsApp flow provides implicit verification. |

---

## 8. Hardest Engineering Challenges

### 1. Order Lifecycle State Machine
The order status transitions must be precise and atomic:
```
Confirmation_Pending ──► Pending ──► Confirmed ──► Completed
                    \           \
                     ──► Cancelled (by customer)
                     ──► Expired (by cron)
                                  ──► Cancelled (by merchant)
```
Every transition must check current status. Solution: `UPDATE orders SET status = 'Pending' WHERE id = $1 AND status = 'Confirmation_Pending' RETURNING id`. If no row returned, the transition was invalid.

### 2. Real-Time Dashboard Updates via Socket.io
The merchant dashboard must reflect orders in real-time without polling. When a customer confirms (→Pending), the merchant's dashboard must show it immediately with visual highlight + chime. Solution: Socket.io rooms scoped by store_id, with `new-order` and `order-status-changed` events.

### 3. Cron Job with Safe Concurrent Access
The 5-minute cron job must not expire orders that are being confirmed in the same millisecond. Solution: Use row-level locking or conditional update (`UPDATE ... WHERE status = 'Confirmation_Pending' AND ...`). The `pg` library's query result `rowCount` tells us if the update succeeded.

### 4. Business Hours Enforcement
The checkout endpoint must check business hours before creating an order. If the store is closed, reject with a clear message. The public storefront must show "closed" state. Both server-side (always trusted) and client-side (for UX) checks required.

### 5. Mobile-First UI for Merchant Dashboard
The dashboard has complex data (order cards, product management, settings) that must work on small screens. Challenge: showing order items, action buttons, and status indicators without cluttering. Solution: Progressive disclosure — show summary on order card, tap to expand details.

---

## 9. Implementation Plan (17 Phases)

### Phase 1: Project Scaffolding
- Initialize root directory, `.gitignore`
- Create `server/` with `package.json`, Express entry, config
- Create `client/` with Vite + React + Tailwind
- Set up `vercel.json`, `Procfile`, `.env.example` files

### Phase 2: Database Foundation
- Write `schema.sql` (all tables + indexes)
- Implement `pool.js` (pg Pool with SSL config)
- Implement `migrate.js` (idempotent schema runner)
- Add migration step to server startup

### Phase 3: Server Middleware
- `config.js` — validate all required env vars on startup
- `errorHandler.js` — centralized error handling
- `validate.js` — input sanitization functions
- `rateLimit.js` — in-memory rate limiter
- `auth.js` — JWT verification middleware
- `storeAccess.js` — store isolation middleware

### Phase 4: Auth System
- `register` route: validate, hash password, create store, return JWT
- `login` route: verify credentials, set JWT cookie
- `logout` route: clear cookie
- `me` route: return current merchant info
- Frontend: LoginPage, RegisterPage, AuthContext, ProtectedRoute

### Phase 5: Public Storefront API
- `GET /api/store/:slug` — return store info + products + open status
- `GET /api/store/:slug/products` — return available products
- `POST /api/store/:slug/orders` — create order with price lock-in, rate limited
- Backend business hours validation

### Phase 6: Order Confirmation Flow
- `GET /api/orders/:orderId` — validate token, return order
- `POST /api/orders/:orderId/confirm` — validate token, conditional update → Pending
- `POST /api/orders/:orderId/cancel` — validate token, conditional update → Cancelled
- Return appropriate messages for invalid status transitions
- Frontend: OrderConfirmation page with confirm/cancel buttons

### Phase 7: Socket.io Layer
- Server-side: Initialize Socket.io with CORS config
- JWT verification on connection handshake
- Join merchant to `store:{store_id}` room on authenticated connect
- Emit `new-order` when order created, `order-status-changed` on status updates
- Frontend: `socket.js` client, `useSocket.js` hook

### Phase 8: Cron Job
- `orderExpiry.js` — 5-minute interval
- Query `Confirmation_Pending` orders older than 60 minutes
- Conditional update to `Expired` (with status check)
- Query orders 28-32 minutes old with no reminder sent
- Update `reminder_sent_at`
- Register cron in `index.js`

### Phase 9: Merchant Dashboard API (Orders)
- `GET /api/dashboard/orders` — filtered by store_id, with status filter
- `GET /api/dashboard/orders/:orderId` — single order with items
- `POST /api/dashboard/orders/:orderId/accept` — → Confirmed
- `POST /api/dashboard/orders/:orderId/complete` — → Completed
- `POST /api/dashboard/orders/:orderId/cancel` — → Cancelled (with wa.me deep link generation)
- All queries include store isolation

### Phase 10: Merchant Dashboard API (Products + Settings)
- CRUD products (all store-scoped)
- Product delete: ON DELETE SET NULL for order_items (done at DB level)
- Get/update store settings
- Get/update business hours
- Generate QR code endpoint

### Phase 11: Public Storefront UI
- StoreFront.jsx: product grid, cart (context), checkout form
- CartContext: add, remove, update quantity, clear
- Business hours display + "closed" state
- Fulfillment method selection (conditional on store settings)
- Delivery fee calculation + free delivery threshold
- Phone validation (Pakistani format)
- Empty cart handling
- Mobile-first design

### Phase 12: Order Confirmation UI
- OrderConfirmation.jsx: fetch order with token, display details
- Confirm/Cancel buttons with status-aware responses
- Already-confirmed, already-cancelled, expired states
- WhatsApp redirect after successful checkout
- Match the visual design spec (store branding info)

### Phase 13: Merchant Dashboard UI
- DashboardLayout: sidebar nav, header, main content
- DashboardHome: order feed with Socket.io live updates
- OrderCard: expandable with items, action buttons
- Visual highlight for new orders, notification chime
- ProductManagement: table/grid with edit modal
- StoreSettings: form for all settings
- BusinessHoursEditor: day-by-day time pickers

### Phase 14: QR Code + Analytics
- Generate QR code on dashboard settings page
- Display QR code with download option
- Basic stats endpoint (today's orders, pending count, total revenue)

### Phase 15: Error Handling & Edge Cases
- Network error states on all pages
- Form validation errors (inline field messages)
- Empty states (no products, no orders)
- Loading skeletons
- 404 pages
- Global error boundary

### Phase 16: Production Hardening
- Rate limit tuning
- Performance optimization (React.memo, useMemo where needed)
- Proper Vite build config for production
- Environment variable validation on startup
- Database connection pool tuning

### Phase 17: Deployment Configuration
- Vercel config for client/ (SPA fallback, env vars)
- Railway config for server/ (start command, env vars)
- Database migration on deploy
- CORS origin set to production URL
- HTTPS enforcement
- Security headers final check

---

## 10. Key Implementation Details

### WhatsApp Deep Link Builder
```js
function buildWaDeepLink(phoneNumber, text) {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}
```

### Confirm Link URL Template
```
https://wa.me/923001234567?text=New%20order%20placed%20—
confirm%20here%3A%20https%3A%2F%2Fyour-app.com%2Fconfirm%2F42%3Ftoken%3D550e8400-e29b-41d4-a716-446655440000
```

### Conditional Update Pattern (Race Condition Safe)
```sql
UPDATE orders 
SET order_status = 'Pending', confirmed_at = NOW() 
WHERE id = $1 AND secure_token = $2 AND order_status = 'Confirmation_Pending'
RETURNING id, order_status;
```
If `rowCount === 0`, the order was already transitioned by another path.

### Business Hours Check (Server-Side)
```js
async function isStoreOpen(storeId) {
  const { rows } = await pool.query(
    `SELECT day_of_week, open_time, close_time, is_closed 
     FROM business_hours WHERE store_id = $1`,
    [storeId]
  );
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = now.toTimeString().slice(0, 5);
  
  const today = rows.find(r => r.day_of_week === currentDay);
  if (!today || today.is_closed) return false;
  
  return currentTime >= today.open_time.slice(0, 5) && 
         currentTime <= today.close_time.slice(0, 5);
}
```

### Rate Limiter (In-Memory)
```js
const rateLimitMap = new Map();

function checkRateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  
  if (!entry || (now - entry.windowStart) > windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  
  if (entry.count >= maxAttempts) {
    return { allowed: false, retryAfter: windowMs - (now - entry.windowStart) };
  }
  
  entry.count++;
  return { allowed: true };
}
```

---

## 11. Design Constraints Summary

1. **No TypeScript** — Plain JavaScript throughout
2. **No WhatsApp automation** — wa.me deep links only
3. **No localStorage for JWTs** — httpOnly cookies only
4. **No global Socket.io broadcasts** — room-based only
5. **No third-party UI libraries** — Tailwind CSS only (keeps bundle small)
6. **No file upload** — image URLs stored as text
7. **No payment processing** — ordering only
8. **Mobile-first** — 95%+ customers on phones
9. **No TypeScript** — the whole team works in JS
10. **PostgreSQL only** — no Redis, no other data stores

---

## 12. Next Steps

This architecture document has been reviewed against all requirements. Clarifying questions have been resolved. Ready for implementation.

**Ready to proceed with Phase 1: Project Scaffolding.**
