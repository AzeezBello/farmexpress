# FarmExpress

FarmExpress is a mobile-first agricultural marketplace connecting African farmers with diaspora consumers and industry buyers. Buyers order produce directly from verified farms; farmers manage listings and fulfil orders; admins verify accounts and oversee payments.

## Stack
| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS 4, lucide-react |
| API | Node.js, Express 5, TypeScript, Zod |
| Database | PostgreSQL, Prisma 6 |
| Auth | JWT (7-day tokens), bcrypt |
| Payments | Paystack (hosted checkout + signed webhooks); admins can also mark offline payments |

## Quick start

Requirements: Node.js 20+ and a PostgreSQL database.

No local Postgres? Start one with Docker:
```bash
docker run -d --name farmexpress-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=farmexpress -p 5432:5432 postgres:16
```

Then, from the repo root:
```bash
npm install                 # root tooling (concurrently)
npm run install:all         # server + client dependencies

cp server/.env.example server/.env
# edit server/.env: set JWT_SECRET to a long random string, e.g. `openssl rand -hex 32`

cd server
npx prisma generate
npx prisma migrate dev --name init
npm run seed
cd ..

npm run dev                 # API on :4000 and web app on :5173
```

Open http://localhost:5173 and sign in with one of the [seed accounts](#seed-accounts).

### Running the apps separately
```bash
cd server && npm run dev    # API only
cd client && npm run dev    # web app only
```

If the API is unreachable, the storefront falls back to demo products so the UI stays explorable. Sign-in, checkout and dashboards need the live API.

## Scripts
| Where | Command | What it does |
| --- | --- | --- |
| root | `npm run install:all` | Install server and client dependencies |
| root | `npm run dev` | Run API and web app together |
| root | `npm run build` | Production build of the web app |
| server | `npm run dev` | API with hot reload (tsx) |
| server | `npm run build` / `npm start` | Compile to `dist/` and run it |
| server | `npm run seed` | Create seed users and products (safe to re-run) |
| client | `npm run dev` / `build` / `preview` | Vite dev server, production build, preview the build |

## Environment variables

**Server** (`server/.env`)
| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Token signing secret. The API won't start without it; in production it must be at least 32 characters |
| `PORT` | no | API port (default `4000`) |
| `CLIENT_URL` | no | Allowed CORS origins, comma-separated. If unset, all origins are allowed; always set it in production |
| `NODE_ENV` | no | Set to `production` to enforce the secret-length check |
| `PAYSTACK_SECRET_KEY` | no | Paystack secret key (`sk_test_…` / `sk_live_…`). Without it, online payment is off and admins mark orders paid manually |
| `APP_URL` | no | Web app URL that Paystack sends buyers back to (default: first `CLIENT_URL`, else `http://localhost:5173`) |
| `PENDING_ORDER_TTL_HOURS` | no | Unpaid orders are cancelled and their stock released after this many hours (default `24`) |
| `PAYSTACK_BASE_URL` | no | Override the Paystack API URL, e.g. to point at a mock in tests (default `https://api.paystack.co`) |

**Client**
| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000/api` | Base URL of the API |

## Seed accounts
All use the password `Password123!`.

| Email | Role | Notes |
| --- | --- | --- |
| buyer@farmexpress.test | Buyer | |
| industry@farmexpress.test | Business buyer | Verified |
| farmer@farmexpress.test | Farmer | Verified, owns the seed products |
| newfarmer@farmexpress.test | Farmer | Awaiting verification, so can't list products until an admin approves |
| admin@farmexpress.test | Admin | Admins can't self-register; create them in the database or seed |

## How it works

### Roles
- **Buyer / Business buyer**: browse, order, track, cancel unpaid orders, review delivered products.
- **Farmer**: list products once verified (KYC approved), manage stock, fulfil paid orders.
- **Admin**: approve or reject farm and business accounts, mark offline payments, cancel orders, handle refunds, view platform stats.

### Order lifecycle
```
PENDING ──Paystack or admin (offline)──▶ PAID ──farmer──▶ CONFIRMED ──farmer──▶ SHIPPED ──farmer──▶ DELIVERED
   │                                      │                   │
   └─ buyer, admin or expiry cancels ─────┴─ admin cancels ───┘   (cancelling restocks inventory)
```
- Stock is reserved atomically when an order is placed, so concurrent orders can't oversell.
- Prices and totals are calculated on the server; the client never sends prices.
- Farmers can only act on orders made up entirely of their own products. Orders mixing several farms are handled by admins.
- A buyer can review a product once an order containing it is delivered, and only once per product.
- Deleting a product that already has orders archives it instead, so order history stays intact.
- Unpaid orders are cancelled automatically after `PENDING_ORDER_TTL_HOURS` (checked every 10 minutes). An order with a payment attempt in the last 30 minutes is left alone, so buyers aren't cancelled mid-checkout.

### Payments (Paystack)
1. The buyer places an order; stock is reserved and the order is `PENDING`.
2. The web app calls `POST /payments/orders/:id/initialize`. The API creates a fresh reference, sends the server-calculated amount (in kobo) to Paystack, and returns the hosted checkout URL.
3. The buyer pays on Paystack (card, bank transfer, USSD…).
4. Paystack settles the payment through **two independent paths**, and either one is enough:
   - **Webhook** `POST /payments/webhook/paystack`: the signature (HMAC-SHA512 of the raw body) is verified before anything is trusted.
   - **Redirect**: Paystack sends the buyer to `APP_URL/?reference=…`; the web app calls `GET /payments/verify/:reference`, which re-checks the transaction with Paystack.
5. Settling checks the amount and currency match the order, then marks the payment `SUCCESSFUL` and the order `PAID`. It is idempotent, so webhook retries and double redirects are harmless.

Edge cases:
- **Retried checkout**: each attempt gets a new reference; paying an older attempt still settles the order via the `orderId` in the transaction metadata.
- **Paid after cancellation** (e.g. the order expired mid-payment): the payment is recorded and the order stays cancelled. The order shows **Refund due**, and the admin overview counts refunds due. Refunds are issued from the Paystack dashboard for now.
- **Paystack unreachable**: the order is kept and the buyer can retry with **Pay now** from their orders.
- **No `PAYSTACK_SECRET_KEY`**: payment endpoints return 503, buyers are told the team will send payment details, and admins use **Mark paid (offline)**.

#### Setting up Paystack
1. Copy your secret key from Paystack → Settings → API Keys & Webhooks into `PAYSTACK_SECRET_KEY`. Use the test key until you go live.
2. Set the webhook URL there to `https://<your-api-host>/api/payments/webhook/paystack`.
3. Set `APP_URL` to the public web app URL.
4. For local webhook testing, expose the API with a tunnel (e.g. `ngrok http 4000`) and use that URL as the webhook. Without a tunnel, the redirect path still confirms payments.

### Web app routes
The app uses hash routes, so any static host works without rewrite rules.

| Route | Page |
| --- | --- |
| `#` / `#marketplace` | Storefront |
| `#/dashboard` | Role dashboard (asks you to sign in if you aren't) |
| `#/dashboard/<tab>` | A dashboard tab: `orders`, `products`, `users`, `profile` (depends on role) |

## API reference
Base path `/api`. Authenticated routes need an `Authorization: Bearer <token>` header. Errors always come back as `{ "message": "..." }` with a matching status code (400 validation, 401 auth, 403 forbidden, 404 not found, 409 conflict, 429 rate-limited).

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/health` | public | Health check |
| POST | `/auth/register` | public, rate-limited | Create a Buyer, Farmer or Industry account; returns `{ token, user }` |
| POST | `/auth/login` | public, rate-limited | Returns `{ token, user }` |
| GET | `/auth/me` | signed in | Current user |
| PATCH | `/auth/me` | signed in | Update name, business name, farm location |
| GET | `/products` | public | In-stock products; filters: `search`, `category`, `farmerId` |
| GET | `/products/categories` | public | Allowed categories |
| GET | `/products/mine` | farmer | Your listings, including out-of-stock |
| GET | `/products/:id` | public | Product with reviews |
| POST | `/products` | verified farmer | Create a listing |
| PUT | `/products/:id` | owning farmer | Update a listing |
| DELETE | `/products/:id` | owning farmer | Delete, or archive if it has orders |
| POST | `/orders` | buyer, industry | Place an order: `{ items: [{ productId, quantity }], deliveryOption, deliveryAddress? }` |
| GET | `/orders/mine` | signed in | Your orders |
| GET | `/orders/incoming` | farmer | Orders containing your products |
| GET | `/orders` | admin | All orders (latest 200) |
| PUT | `/orders/:id/status` | depends on the change | Move an order along the lifecycle above |
| GET | `/payments/config` | public | `{ paystack, pendingOrderTtlHours }` |
| POST | `/payments/orders/:id/initialize` | ordering buyer | Start Paystack checkout; returns `{ authorizationUrl, reference }` (503 if Paystack isn't configured) |
| GET | `/payments/verify/:reference` | ordering buyer | Confirm a payment after the Paystack redirect |
| POST | `/payments/webhook/paystack` | Paystack (signed) | Payment events; rejected with 401 if the signature is invalid |
| GET | `/reviews/product/:productId` | public | Reviews for a product |
| GET | `/reviews/mine` | signed in | Your reviews |
| POST | `/reviews` | buyer with a delivered order | `{ productId, rating (1-5), comment? }` |
| GET | `/admin/users` | admin | Users; filters: `role`, `kycStatus` |
| PUT | `/admin/users/:id/kyc` | admin | `{ status: "PENDING" \| "APPROVED" \| "REJECTED" }` |
| GET | `/admin/analytics` | admin | Users, farmers, pending KYC, products, orders, revenue (paid orders only), refunds due |

Login and registration allow 20 attempts per 15 minutes per IP. The limiter is in memory, so move it to Redis before running more than one API instance.

## Project structure
```
client/
  src/
    App.tsx              routing shell (storefront or dashboard)
    Storefront.tsx       marketplace, search, cart and checkout flow
    components/          AuthModal, CartDrawer, CheckoutModal, ProductCard, shared UI
    dashboard/           Buyer, Farmer and Admin dashboards plus shared panels
    lib/                 API client, auth context, cart, payments, hooks, types, formatting
server/
  prisma/
    schema.prisma        data model
    seed.ts              seed users and products
  src/
    index.ts             app setup and error handling
    config.ts            environment validation
    middleware/          auth, roles, rate limiting
    routes/              auth, products, orders, reviews, admin, payments
    services/            order transitions, cancellation and expiry; payment settlement
    lib/                 HTTP errors, token helpers, Paystack client
```

## Deployment

### Web app → Vercel
The root `vercel.json` makes Vercel install and build only the client:

| Setting | Value |
| --- | --- |
| Install command | `npm ci --prefix client` |
| Build command | `npm --prefix client run build` |
| Output directory | `client/dist` |

Leave the project's Root Directory at the repository root. In the Vercel project settings, set **`VITE_API_URL`** to your deployed API, e.g. `https://api.example.com/api`. Vite bakes it in at build time, so redeploy after changing it. Without it, the site calls `localhost` and shows the demo marketplace.

The app uses hash routes, so no rewrite rules are needed.

### API → Railway / Render
The Express API is a long-running server (it runs the order-expiry job), so host it on Railway, Render or similar, not Vercel functions.
- Root directory: `server`
- Build: `npm ci && npx prisma generate && npm run build`
- Start: `npx prisma migrate deploy && npm start`
- Environment: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `CLIENT_URL` (your Vercel URL), `APP_URL`, `PAYSTACK_SECRET_KEY`

`prisma migrate deploy` only applies committed migrations. Before the first API deploy, run `npx prisma migrate dev --name init` locally and commit `server/prisma/migrations/`.

## Troubleshooting
- **`Missing required environment variable JWT_SECRET`**: create `server/.env` from `.env.example` and set `JWT_SECRET`.
- **Vercel build fails with `tsc: command not found`**: the client dependencies weren't installed. Make sure `vercel.json` is committed and no Install/Build Command overrides are set in the Vercel dashboard.
- **Storefront shows "Demo marketplace — API offline"**: the API isn't reachable at `VITE_API_URL`. Check that it's running and that `CLIENT_URL` includes the web app's origin.
- **`@prisma/client did not initialize yet`**: run `npx prisma generate` in `server/`.
- **Farmer can't add products**: the account is awaiting verification. Approve it from the admin dashboard under **Users & KYC**.
- **"Too many attempts"**: the login rate limit was hit. Wait up to 15 minutes or restart the API.
- **Buyer paid but the order still says "Awaiting payment"**: the webhook isn't reaching the API (check the webhook URL in Paystack and the API logs). The redirect back from Paystack confirms payments on its own, so this usually means the buyer closed the tab before being redirected. Check the payment in the Paystack dashboard, then an admin can use **Mark paid (offline)**.
- **"Online payment is not available yet"**: `PAYSTACK_SECRET_KEY` isn't set on the API.
- **Paystack returns buyers to the wrong site**: set `APP_URL`.

## Roadmap
**Done**
- ~~Connect PostgreSQL~~
- ~~JWT registration and login UI~~
- ~~Order checkout~~
- ~~Farmer product management~~
- ~~Admin moderation and analytics~~
- ~~Paystack checkout and webhooks~~
- ~~Automatic expiry of unpaid orders~~

**Next**
1. KYC document upload and storage
2. Delivery tracking and email/SMS notifications (order placed, paid, dispatched)
3. Refunds through the Paystack API (refunds are issued from the Paystack dashboard today)
4. Product image upload (listings take an image URL today)
5. Pagination and an admin audit log
6. Automated tests in CI
7. Deploy the API to Railway or Render and commit the initial Prisma migration (the web app deploys to Vercel via `vercel.json`)
