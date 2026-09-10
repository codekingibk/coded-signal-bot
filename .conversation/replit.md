# Coded Signal Bot

A mobile-first paid-access signal terminal with Paystack checkout, secure access keys, customer sessions, and a separate admin console.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `ADMIN_EMAIL`, and `ADMIN_INITIAL_PASSWORD`. Keep secrets in Replit Secrets; see `.env.example` for names.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/coded-signal-bot/src/App.tsx` — customer landing/dashboard and admin console UI.
- `artifacts/api-server/src/routes/coded-signal.ts` — Paystack, access, signal, referral, streak, and admin routes.
- `artifacts/api-server/src/lib/signal-engine.ts` — deterministic stateful signal windows.
- `lib/db/src/schema/index.ts` — PostgreSQL schema source of truth.
- `lib/api-spec/openapi.yaml` — API contract source of truth.

## Architecture decisions

- Customers are anonymous: verified Paystack payment or an access key creates a server-side session; there is no customer registration system.
- Access keys are stored as SHA-256 hashes and are only plaintext at issuance/reveal time.
- Signals are deterministic per three-minute server window and persisted in PostgreSQL, so the UI never relies on browser randomness or client clocks.
- Admin sessions and customer sessions use separate HttpOnly cookies and separate database tables.

## Product

- Public landing page with live pricing, Paystack checkout, key activation, WhatsApp channel link, referral/streak education, and responsible-use language.
- Protected dashboard with current/next signal, history, access countdown, referrals, streaks, and logout.
- Admin console with password bootstrap/change, overview metrics, pricing controls, giveaway code batches, code revocation, payments, and audit logs.

## User preferences

- The product requirement explicitly forbids customer accounts, fake payments, placeholder signals, and mock core functionality.

## Gotchas

- Paystack verification remains server-side and checks reference, status, amount, currency, and replay state before issuing a key.
- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- The Vite build command needs workflow-provided `PORT` and `BASE_PATH`; use the managed web workflow for previews.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
