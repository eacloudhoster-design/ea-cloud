# EA Cloud

Premium AI-powered copy trading ecosystem connecting expert mentors with clients through intelligent signal copying.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed database with superadmin and demo mentor
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + wouter + TanStack Query + Framer Motion + Recharts + Lucide + react-icons
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for contracts)
- `lib/db/src/schema/` — DB schema tables (users, licenses, clients, activity, app_access)
- `lib/api-client-react/src/generated/` — Generated React Query hooks and Zod schemas
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/ea-cloud/src/pages/` — Frontend pages (Landing, Register, admin/*, superadmin/*)
- `artifacts/ea-cloud/src/components/layout/` — Shared layout (Navbar, Footer, AdminSidebar, SuperAdminSidebar)
- `artifacts/ea-cloud/src/contexts/AuthContext.tsx` — Auth context with JWT token handling

## Architecture decisions

- Token auth: simple base64 token (userId:role:timestamp) stored in localStorage, sent as Bearer header
- Password hashing: SHA-256 with salt "ea_cloud_salt_2024" (upgrade to bcrypt for production)
- Role-based portals: mentor → /admin/*, superadmin → /superadmin/*
- Auth token getter: `setAuthTokenGetter` in main.tsx wires localStorage token to all API calls
- Drizzle ORM with `drizzle-kit push` for schema management (no migration files)

## Product

EA Cloud has 4 main sections:
1. **Landing Page** (`/`) — Hero, features grid, download section, FAQ
2. **Mentor Admin Portal** (`/admin/*`) — Dashboard, Setup Method, Profile, Licenses, Clients, Settings
3. **Super Admin Portal** (`/superadmin/*`) — Dashboard, Mentors management, App Access, Licenses, Settings
4. **Mobile App** — Expo React Native app (planned)

## User preferences

- Dark fintech aesthetic: `#080810` background, `#e31e24` primary (red), `#1a6bff` accent (blue)
- Glassmorphism card style: `bg-white/3 border border-white/8 backdrop-blur-sm`
- Framer Motion for all page transitions and hover effects
- Tagline: "Black by Code. Red by Choice."

## Seed Credentials

- Super Admin: `eacloudhoster@gmail.com` / `Tapiwanashe@13`
- Demo Mentor: `mentor@eacloud.com` / `mentor123`

## Gotchas

- Always restart the API server workflow after adding new routes (esbuild needs to rebuild)
- `pnpm --filter @workspace/db run push-force` if DB push fails with conflicts
- The `usePortalRedirect()` hook handles auth guards — must be called at top of every portal page
- Import hooks from `@workspace/api-client-react` (generated), not directly from api.ts

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
