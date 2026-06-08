# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (Vite)
npm run build      # Production build
npm run lint       # ESLint
npm run preview    # Preview production build locally
```

There is no test suite. Type-checking is done via `tsc --noEmit` (implied by the build step).

## Architecture Overview

This is a Spanish-language accounting SPA (Libro Diario / ERP BV) built with React + TypeScript + Vite, backed by Supabase. The UI uses shadcn/ui components throughout.

### Data layer — `src/accounting/`

All persistence goes through the `IDataAdapter` interface in `data-adapter.ts`. There are two implementations:

- **`LocalAdapter`** — reads/writes `localStorage`. Used as fallback when Supabase is unreachable.
- **`SupaAdapter`** — reads/writes Supabase tables. Uses `fetchAllPaginated()` (1000-row chunks) to bypass PostgREST's silent 1000-row limit.

`pickAdapter()` probes Supabase at startup and returns `SupaAdapter` if reachable, otherwise `LocalAdapter`.

**`AccountingProvider`** (React context) loads all data once at startup via the adapter and exposes it plus setters. Every page reads from this context via `useAccounting()`.

### Core domain types — `src/accounting/types.ts`

Key entities:
- `Account` — chart of accounts; `type` ∈ `{ACTIVO, PASIVO, PATRIMONIO, INGRESO, GASTO}`, `normal_side` ∈ `{DEBE, HABER}`.
- `JournalEntry` + `JournalLine` — double-entry ledger entries; `id` format is `NNN-QN-YY` (e.g. `001-Q1-25`).
- `AuxiliaryLedgerDefinition` / `AuxiliaryLedgerEntry` / `AuxiliaryMovementDetail` — sub-ledgers linked to specific accounts.
- `KardexDefinition` / `KardexMovement` — inventory kardex (perpetual inventory) per account.
- `Shipment` / `ShipmentProduct` — import shipment module (see `shipment-types.ts`).

### Financial calculation utilities — `src/accounting/`

- `utils.ts` — `round2()` for all monetary values, `round6()` for unit costs, `generateEntryId()` / `generateChronologicalEntryId()`, `signedBalanceFor()`, locale-aware `fmt()` (Bolivian locale `es-BO`).
- `kardex-utils.ts` — `calculateCPP()` computes Weighted Average Cost (Costo Promedio Ponderado) for a sequence of kardex movements.
- `period-utils.ts` — unified monthly/quarterly/annual period resolution; `resolvePeriod()` is the entry point for report filtering.
- `quarterly-utils.ts` — quarter boundaries; `getQuarterIdentifier(date)` returns the `QN-YY` suffix used in entry IDs.

### Auth & access control — `src/components/auth/` + `src/contexts/UserAccessContext.tsx`

- `AuthProvider` wraps Supabase auth.
- `UserAccessProvider` checks `user_roles` table for `owner` vs `viewer` role.
  - **owners** see all routes including `/settings`, `/shipments`, `/inventory`, `/sales`.
  - **viewers** only see their dashboard plus permitted accounting views; `targetUserId` switches to the owner's data.
- Route guarding lives in `App.tsx` (not in `router.tsx`, which is an older unused file).

### Pages and components

Pages are thin shells in `src/pages/<module>/Index.tsx`; heavy logic lives in components under `src/components/<module>/`.

The journal entry form uses `useJournalForm` hook (`src/hooks/useJournalForm.ts`) which manages line drafts, account selection, and kardex popup coordination. Kardex popup state is held in the journal page and passed down.

### Services — `src/services/`

- `exportService.ts` — generic CSV export.
- `pdfService.ts` — jsPDF-based PDF generation.
- `backupService.ts` — JSON export/import of all data.
- `auditService.ts` — audit log utilities.
- `aiService.ts` — AI assistant integration.

### Supabase integration

Client lives in `src/integrations/supabase/client.ts`. Migrations are in `supabase/migrations/`. The Supabase project URL/key come from `.env` (not committed).

### Locale & currency

All amounts are in Bolivianos (Bs). Number formatting uses `es-BO` locale (dot as thousands separator, comma as decimal). Input parsing in `toDecimal()` handles both `1.234,56` and `1234.56` forms. Use `round2()` for all monetary arithmetic to avoid floating-point drift.

---

## Standing rules — apply automatically on every change

These rules are always in effect. They do not need to be requested each session.

### 1 · Multi-company (Holding) architecture

The system is structured as a **Holding with multiple companies underneath**.

- Every new table must have a `company_id uuid REFERENCES companies(id)` column (or inherit ownership via a parent table that does).
- Every new client-side query must be scoped to the active `company_id` — never query data across companies without an explicit holding-level view.
- RLS policies must filter by `company_id` (or by `user_id` via a join to a table that has `company_id`). A policy that only filters by `user_id` without respecting company scope is a bug.
- When a user switches companies (`switchCompany`), all module data must reload for the new company. Do not cache cross-company data.
- Config tables (e.g. `company_module_config`) are always keyed by `company_id`, never globally.

### 2 · Backup coverage

`src/services/backupService.ts` is the single source of truth for data portability.

- **Every new Supabase table must be added to the backup** in the same PR/commit that introduces it — no exceptions unless explicitly told otherwise.
- Follow the existing pattern: add a `fetch*` helper, include it in `Promise.all` inside `createFullBackup()`, add the field to `BackupData`, add the delete block in `_performRestoreInternal()` (respecting FK order), and add the insert block in `_performRestoreInternal()`.
- If a table has no `user_id` (owned via FK to a parent table), use an inner-join query like `fetchAllJournalLines()` or `fetchAllLicitacionProductos()` and strip the join column before storing.
- Tables that are scoped by `company_id` instead of `user_id` use `fetchAllCompanyRows()`.
- After adding backup support, update `validateBackupFile()` to list the new field in `optionalArrays`.
- Storage bucket files (binaries) are not included in the JSON backup — document this as a known limitation in a comment.

### 3 · Security checklist — verify before every commit

Run through this list mentally before finishing any change. Flag issues in code comments or fix them before committing.

| # | Check |
|---|-------|
| S1 | **IDOR**: every UPDATE/DELETE includes `.eq('user_id', user.id)` (or `.eq('company_id', ...)` for company-scoped tables). Never rely solely on RLS as the only guard — defence in depth. |
| S2 | **Child table IDOR**: operations on tables without `user_id` (e.g. `journal_lines`, `licitacion_productos`) must validate ownership via the parent row's `user_id` before mutating. |
| S3 | **XSS via URLs**: any field that renders as an `<a href>` must be validated with `/^https?:\/\//i` before rendering. Never render `javascript:` or `data:` URLs. |
| S4 | **Open redirect**: navigation targets derived from user input or URL params must be validated against an allowlist of internal routes. |
| S5 | **Injection in AI prompts**: text sent to Groq or any LLM must be sanitized (strip control characters) and length-limited. Never concatenate raw user HTML into prompts. |
| S6 | **RLS double-check**: any new Supabase table must have RLS enabled and at least one SELECT policy scoped to the authenticated user's company. |
| S7 | **Secrets**: `.env` values are never hardcoded. Edge function secrets go through Supabase Dashboard → Secrets, never in function source. |

### 4 · Code quality checklist — verify before every commit

| # | Check |
|---|-------|
| Q1 | Run `tsc --noEmit` — zero type errors required before committing. |
| Q2 | No `console.log` left in production paths (use `console.warn`/`console.error` only for genuine warnings/errors). |
| Q3 | Monetary arithmetic uses `round2()`. Never use raw floating-point addition/subtraction for Bs amounts. |
| Q4 | New paginated queries use `fetchAllPaginated()` — never assume PostgREST returns all rows without pagination. |
| Q5 | React components that accept URLs from user data validate the URL before rendering links (see S3). |
| Q6 | No dead imports or unused variables (ESLint will catch most of these; run `npm run lint` if in doubt). |

### 5 · When to skip these rules

Only skip a rule when the user **explicitly** says so in the current message (e.g. "skip backup for this one", "this is a read-only table, no restore needed"). Never skip silently.
