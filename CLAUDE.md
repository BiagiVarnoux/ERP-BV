# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npm run dev        # Start dev server (Vite)
npm run build      # Production build
npm run lint       # ESLint
npm run preview    # Preview production build locally
tsc --noEmit       # Type-check without emitting (required to pass before every commit)
```

There is no test suite. Type-checking is done via `tsc --noEmit` (implied by the build step).

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI components | shadcn/ui (Radix primitives + Tailwind) |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + RLS) |
| PDF export | jsPDF |
| AI assistant | Groq (via `aiService.ts` / `licitacionAiService.ts`) |
| Locale | `es-BO` — Bolivian Spanish, Bolivianos (Bs) |

---

## High-Level Architecture

```
Browser
 └── React SPA (Vite)
      ├── AuthProvider          (Supabase auth session)
      ├── UserAccessProvider    (company membership, role, per-module permissions)
      ├── AccountingProvider    (all accounting data for active company, loaded once)
      └── Pages / Components
           └── IDataAdapter ──► SupaAdapter  (Supabase, primary)
                             └► LocalAdapter (localStorage, offline fallback)
```

**Multi-company (Holding) model:**  
One user → many `company_members` rows → many companies. The *active* company is
selected via `switchCompany()` and stored in `UserAccessContext`. All queries are
scoped to `activeCompanyId`. Never mix data from different companies in a single
query or cache.

---

## Data Layer — `src/accounting/`

### `data-adapter.ts` — `IDataAdapter` interface

Two concrete implementations:

| Adapter | Storage | When used |
|---|---|---|
| `SupaAdapter` | Supabase tables | Supabase reachable (default) |
| `LocalAdapter` | `localStorage` | Supabase unreachable (fallback) |

`pickAdapter()` probes Supabase at startup and chooses accordingly.

`fetchAllPaginated<T>(queryFn, from, to)` — always use this for any query that
could return > 1000 rows. PostgREST silently truncates at 1000; this function
loops in 1000-row chunks until done.

**`AccountingProvider`** (React context) loads all data once at startup via the
adapter and exposes it plus setters. Every accounting page reads from this context
via `useAccounting()`.

### Core domain types — `src/accounting/types.ts`

| Type | Description |
|---|---|
| `Account` | Chart of accounts; `type` ∈ `{ACTIVO,PASIVO,PATRIMONIO,INGRESO,GASTO}`, `normal_side` ∈ `{DEBE,HABER}` |
| `JournalEntry` + `JournalLine` | Double-entry ledger; entry `id` format `NNN-QN-YY` (e.g. `001-Q1-25`) |
| `AuxiliaryLedgerDefinition` / `AuxiliaryLedgerEntry` / `AuxiliaryMovementDetail` | Sub-ledgers linked to specific accounts |
| `KardexDefinition` / `KardexMovement` | Perpetual inventory per account (CPP method) |
| `FiscalYear` | Yearly accounting period with open/closed state |

Shipment and licitación types live in separate files:
- `shipment-types.ts` — `Shipment`, `ShipmentProduct`, `CostSheet`, `ImportLot`
- `licitacion-types.ts` — `Licitacion`, `LicitacionProducto`, `LicitacionDocumento`

### Calculation utilities

| File | Key exports |
|---|---|
| `utils.ts` | `round2()` (monetary), `round6()` (unit costs), `fmt()` (es-BO format), `toDecimal()` (parse both locales), `generateEntryId()`, `generateChronologicalEntryId()`, `signedBalanceFor()`, `todayISO()` |
| `kardex-utils.ts` | `calculateCPP()` — Weighted Average Cost (Costo Promedio Ponderado) |
| `period-utils.ts` | `resolvePeriod()` — unified monthly/quarterly/annual period resolution for reports |
| `quarterly-utils.ts` | `getQuarterIdentifier(date)` → `QN-YY` suffix used in entry IDs |
| `fiscal-year-utils.ts` | Fiscal year boundary helpers |
| `shipment-utils.ts` | Cost sheet arithmetic for import shipments |
| `licitacion-utils.ts` | Quotation calculations (floor price, ROI, GA%, freight) |
| `shipment-storage.ts` | Supabase Storage helpers for `shipment-docs` bucket (path: `{company_id}/{shipment_id}/`) |
| `licitacion-storage.ts` | Supabase Storage helpers for licitación documents |
| `timezone.ts` | Bolivia timezone offset utilities |

---

## Auth & Access Control — `src/contexts/UserAccessContext.tsx`

### Key concepts

```
UserAccessContext
 ├── companies[]         list of companies the user belongs to
 ├── activeCompanyId     currently selected company
 ├── role                'owner'|'manager'|'accountant'|'auditor'|'viewer'|'custom'
 ├── permissionsMap      Partial<Record<ErpModule, ModulePermission>>
 ├── isOwner             role === 'owner'
 ├── isViewer            role === 'viewer' || role === 'auditor'  (read-only roles)
 ├── isReadOnly          true if permissionsMap has ZERO write permissions anywhere
 ├── can(module, action) granular check: reads from permissionsMap
 ├── canView(module)     permissionsMap[module]?.can_view ?? false
 └── switchCompany(id)   reload all data for a different company
```

### `ErpModule` enum

```typescript
type ErpModule =
  | 'accounts' | 'journal' | 'ledger' | 'auxiliary_ledgers' | 'reports'
  | 'fiscal_years' | 'inventory' | 'sales' | 'customers' | 'receivables'
  | 'payables' | 'shipments' | 'settings' | 'holding' | 'licitaciones';
```

### `ModuleAction` enum

```typescript
type ModuleAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';
```

### How permissions are loaded

1. On mount / company switch, `UserAccessContext` queries `company_members` to get `role` and `company_id`.
2. Calls `get_my_permissions(p_company_id)` RPC → returns rows from `member_permissions` table.
3. Builds `permissionsMap`. For **owners**, all modules get full permissions (no `member_permissions` rows needed).
4. For custom roles: permissions come entirely from `member_permissions` rows. If no rows exist yet, the RPC returns empty → fallback grants all modules at `can_view=true` only (read-only until configured).

### `isReadOnly` vs `can(module, action)`

- **`isReadOnly`** — global flag. Used only for UI chrome (e.g. `<ReadOnlyBanner>`). Computed by scanning ALL modules' permissions — if no module has any write perm, `isReadOnly = true`.
- **`can(module, action)`** — use this in individual pages for showing/hiding buttons. A user with write access to `sales` but not `journal` is NOT `isReadOnly`, but `can('journal', 'create')` returns false.

### Route guarding

Route guarding lives in `src/App.tsx` (NOT `router.tsx` — that file is unused).

`defaultRoute` is computed dynamically: first accessible module based on `canView()`, fallback to `/viewer-dashboard`.

```typescript
// Pattern used in every module page:
const { can } = useUserAccess();
const canCreate = can('sales', 'create');
const canEdit   = can('sales', 'edit');
const canDelete = can('sales', 'delete');
```

### Database tables for access control

| Table | Purpose | Ownership |
|---|---|---|
| `companies` | Company registry | `user_id` (owner) |
| `company_members` | User ↔ company membership with role | FK → `companies` |
| `member_permissions` | Per-module permissions for non-owner members | FK → `company_members` |
| `company_module_config` | Per-company feature flags (enable/disable modules) | `company_id` |
| `company_invitations` | Invitation codes for joining a company | FK → `companies` |

---

## Database Table Inventory

Complete list of all Supabase tables. Every table must:
1. Have `company_id` (or inherit it via FK) — **never** store data without company scope.
2. Have RLS enabled with a policy scoped to `company_members WHERE user_id = auth.uid()`.
3. Be included in backup (see Rule 2 below).

### Accounting core

| Table | `company_id` | RLS policy type | In backup | Notes |
|---|---|---|---|---|
| `accounts` | direct | company_member | ✅ | Chart of accounts |
| `journal_entries` | direct | company_member | ✅ | Header row; id = `NNN-QN-YY` |
| `journal_lines` | via `journal_entries` | child (join) | ✅ | Debit/credit lines; fetched via join |
| `auxiliary_ledger_definitions` | direct | company_member | ✅ | Sub-ledger definitions |
| `auxiliary_ledger` | direct | company_member | ✅ | Sub-ledger entries |
| `auxiliary_movement_details` | direct | company_member | ✅ | Movement detail rows |
| `kardex_definitions` | direct | company_member | ✅ | Kardex (inventory) definitions |
| `kardex_entries` | direct | company_member | ✅ | Kardex period entries |
| `kardex_movements` | direct | company_member | ✅ | Individual stock movements |
| `quarterly_closures` | direct | company_member | ✅ | Quarter close records |
| `fiscal_years` | direct | company_member | ✅ | Annual fiscal periods |
| `report_settings` | direct | company_member | ✅ | Saved report configs |

### Inventory & shipments

| Table | `company_id` | RLS policy type | In backup | Notes |
|---|---|---|---|---|
| `products` | direct | company_member | ✅ | Product catalog with archiving support |
| `inventory_lots` | direct | company_member | ✅ | FIFO cost lots |
| `inventory_movements` | direct | company_member | ✅ | FIFO in/out movements |
| `shipments` | direct | company_member | ✅ | Import shipment headers |
| `import_lots` | direct | company_member | ✅ | Shipment import lots |
| `cost_sheets` | direct | company_member | ✅ | Cost sheet headers |
| `cost_sheet_cells` | direct | company_member | ✅ | Cost sheet cell values |

Storage bucket: `shipment-docs` — paths use `{company_id}/{shipment_id}/filename`.  
⚠️ Binary files are NOT included in the JSON backup (documented limitation).

### Sales & receivables

| Table | `company_id` | RLS policy type | In backup | Notes |
|---|---|---|---|---|
| `customers` | direct | company_member | ✅ | Customer registry |
| `sales` | direct | company_member | ✅ | Sale headers |
| `sale_items` | via `sales` | child (join) | ✅ | Line items; fetched via join |
| `receivables` | direct | company_member | ✅ | Accounts receivable |
| `payables` | direct | company_member | ✅ | Accounts payable |
| `debt_payments` | direct | company_member | ✅ | Payment records for receivables/payables |

### Licitaciones (tenders)

| Table | `company_id` | RLS policy type | In backup | Notes |
|---|---|---|---|---|
| `licitaciones` | direct | company_member | ✅ | Tender/bid headers |
| `licitacion_productos` | via `licitaciones` | child (join) | ✅ | Quoted products per tender |
| `licitacion_documentos` | via `licitaciones` | child (join) | ✅ | Attached documents |

### System / multi-company

| Table | Ownership | RLS policy type | In backup | Notes |
|---|---|---|---|---|
| `companies` | `user_id` (owner) | owner only | ✅ (company row) | Company registry |
| `company_members` | FK → companies | via companies | ✅ | Membership + roles |
| `member_permissions` | FK → company_members | via company_members | ✅ | Granular module permissions |
| `company_module_config` | `company_id` | company_member | ✅ | Feature flags per company |
| `company_invitations` | FK → companies | owner only | — | Short-lived; not backed up |
| `audit_log` | `company_id` | company_member | — | Append-only; not restored |

---

## Module Map

Each module = one page shell + one component folder (usually). Find any module's code here:

### Accounting modules

| Module | Route | Page | Components | Domain files |
|---|---|---|---|---|
| Chart of Accounts | `/accounts` | `src/pages/accounts/Index.tsx` | `src/components/accounts/` | `types.ts` |
| Journal (Libro Diario) | `/journal` | `src/pages/journal/Index.tsx` | `src/components/journal/` | `types.ts`, `useJournalForm.ts` |
| Ledger (Mayor) | `/ledger` | `src/pages/ledger/Index.tsx` | `src/components/reports/` | `period-utils.ts` |
| Auxiliary Ledgers | `/auxiliary-ledgers` | `src/pages/auxiliary-ledgers/Index.tsx` | `src/components/auxiliary-ledger/` | `types.ts` |
| Kardex | (embedded in journal) | — | `src/components/kardex/` | `kardex-utils.ts` |
| Reports | `/reports` | `src/pages/reports/Index.tsx` | `src/components/reports/` | `period-utils.ts`, `pdfService.ts` |
| Fiscal Years | `/fiscal-years` | `src/pages/fiscal-years/Index.tsx` | `src/components/settings/` | `fiscal-year-utils.ts` |

### Operations modules

| Module | Route | Page | Components | Domain files |
|---|---|---|---|---|
| Inventory | `/inventory` | `src/pages/inventory/Index.tsx` | `src/components/inventory/` | `types.ts`, `fifo-utils.ts` |
| Sales (Ventas) | `/sales` | `src/pages/sales/Index.tsx` | `src/components/sales/` | `types.ts` |
| Customers | `/customers` | `src/pages/customers/Index.tsx` | `src/components/customers/` | `src/accounting/domain/customers.ts` |
| Receivables (Cobros) | `/receivables` | `src/pages/receivables/Index.tsx` | `src/components/` (inline) | `src/accounting/domain/receivables.ts` |
| Payables (Pagos) | `/payables` | `src/pages/payables/Index.tsx` | `src/components/` (inline) | `src/accounting/domain/payables.ts` |
| Shipments (Embarques) | `/shipments` | `src/pages/shipments/Index.tsx` | `src/components/shipments/` | `shipment-types.ts`, `shipment-utils.ts`, `shipment-storage.ts` |
| Licitaciones | `/licitaciones` | `src/pages/licitaciones/Index.tsx` | `src/components/licitaciones/` | `licitacion-types.ts`, `licitacion-utils.ts`, `licitacion-storage.ts` |

### Admin modules

| Module | Route | Page | Components | Notes |
|---|---|---|---|---|
| Settings | `/settings` | `src/pages/settings/Index.tsx` | `src/components/settings/` | Owner only |
| Users | `/users` | `src/pages/users/Index.tsx` | `src/components/users/` | Owner only |
| Holding | `/holding` | `src/pages/holding/Index.tsx` | — | Cross-company view |
| Viewer Dashboard | `/viewer-dashboard` | `src/pages/viewer-dashboard/Index.tsx` | — | For viewer/auditor roles |
| Dashboard | `/dashboard` | `src/pages/dashboard/Index.tsx` | — | Main entry for owners |

### Shared infrastructure

| Path | Purpose |
|---|---|
| `src/components/layout/` | Sidebar, header, nav items |
| `src/components/shared/` | `ReadOnlyBanner`, generic dialogs |
| `src/components/auth/` | Login, `AuthProvider` |
| `src/components/audit/` | Audit log viewer |
| `src/components/backup/` | Backup/restore UI |
| `src/components/ui/` | shadcn/ui component overrides |

### Key hooks

| Hook | File | Purpose |
|---|---|---|
| `useJournalForm` | `src/hooks/useJournalForm.ts` | Journal entry form state, line drafts, kardex popup coordination |
| `useReportSettings` | `src/hooks/useReportSettings.ts` | Persisted report filter state |
| `usePersistedState` | `src/hooks/usePersistedState.ts` | `localStorage`-backed `useState` |
| `useAccounting` | `src/accounting/AccountingProvider.tsx` | All accounting data for active company |
| `useUserAccess` | `src/contexts/UserAccessContext.tsx` | Auth, company, role, permissions |
| `useActiveCompanyId` | `src/contexts/UserAccessContext.tsx` | Quick accessor for `activeCompanyId` |

### Services — `src/services/`

| Service | Purpose |
|---|---|
| `backupService.ts` | JSON backup/restore of all company data |
| `exportService.ts` | Generic CSV export |
| `pdfService.ts` | jsPDF-based PDF generation |
| `auditService.ts` | Write audit log entries |
| `aiService.ts` | AI chat assistant (Groq) |
| `licitacionAiService.ts` | AI suggestions for licitaciones |

---

## RLS Policy Pattern

All production tables use this standard policy (applied in migrations `20260610000001` and `20260610000002`):

```sql
-- For tables WITH company_id:
CREATE POLICY "company_member_all" ON public.<table>
  FOR ALL USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  ) WITH CHECK ( /* same */ );

-- For child tables WITHOUT company_id (e.g. journal_lines, licitacion_productos):
CREATE POLICY "company_member_all" ON public.<table>
  FOR ALL USING (
    <parent_fk> IN (
      SELECT p.id FROM public.<parent_table> p
      WHERE p.company_id IN (
        SELECT cm.company_id FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  ) WITH CHECK ( /* same */ );
```

**Defense-in-depth rule**: client-side mutations must also include `.eq('company_id', activeCompanyId)` (or validate parent ownership). RLS is not the only guard.

---

## Operational Checklists

### Adding a new Supabase table

- [ ] Add `company_id uuid NOT NULL REFERENCES companies(id)` (or inherit via parent FK).
- [ ] Enable RLS: `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;`
- [ ] Create `company_member_all` policy using the standard pattern above.
- [ ] Add to `backupService.ts`: fetch helper + `BackupData` field + `Promise.all` entry + delete block (FK order) + insert block.
- [ ] Add to `validateBackupFile()` `optionalArrays` list.
- [ ] Client mutations: include `.eq('company_id', activeCompanyId)` on every UPDATE/DELETE.
- [ ] Run `tsc --noEmit` and `npm run lint` — zero errors.

### Adding a new module/page

- [ ] Create `src/pages/<module>/Index.tsx` (thin shell).
- [ ] Create `src/components/<module>/` for heavy logic.
- [ ] Add the module to `ErpModule` type in `UserAccessContext.tsx`.
- [ ] Add `canView('<module>')` route guard in `App.tsx`.
- [ ] Add to `defaultRoute` cascade in `App.tsx`.
- [ ] Add `ALL_MODULES` array in `UserAccessContext.tsx` (owner fallback permissions).
- [ ] Add sidebar nav item in `src/components/layout/`.
- [ ] Use `can('<module>', action)` for all write-action buttons in the page.
- [ ] Add a `member_permissions` seed default for new owners if applicable.
- [ ] Follow backup rule above for any new tables the module introduces.

### Doing an RLS migration (adding a new table or fixing an existing policy)

- [ ] Identify all tables in the feature: direct tables + child tables.
- [ ] For each table, determine if it has `company_id` directly or inherits via FK.
- [ ] Write the appropriate policy from the standard pattern.
- [ ] `DROP POLICY IF EXISTS "<old name>"` before creating the new one.
- [ ] Test with a non-owner company member account — verify they see the right data.
- [ ] Check child tables — they are easy to miss (lesson from `licitacion_productos` / `journal_lines`).

### Adding/changing permissions for a module

- [ ] `member_permissions` table stores one row per (member, module).
- [ ] `get_my_permissions(p_company_id)` RPC returns all permission rows for the calling user.
- [ ] Owner role bypasses `member_permissions` — full access always.
- [ ] When creating a new `ErpModule`: add it to the `ALL_MODULES` fallback array so new users get `can_view=true` by default.
- [ ] The Settings → Members UI writes to `member_permissions` via `src/components/users/` or `src/pages/settings/`.

---

## Locale & Currency

All amounts are in Bolivianos (Bs). Number formatting uses `es-BO` locale:
- Thousands separator: `.` (dot)
- Decimal separator: `,` (comma)
- Example: `Bs 1.234,56`

`toDecimal(s)` in `utils.ts` parses both `1.234,56` (es-BO) and `1234.56` (en-US) forms.

**Always use `round2()` for monetary arithmetic** to avoid floating-point drift.  
**Always use `round6()` for unit costs** (costo unitario).  
Never do raw `a + b` on Bs amounts — use `round2(a + b)`.

---

## Supabase Integration

- Client: `src/integrations/supabase/client.ts`
- Migrations: `supabase/migrations/` — named `YYYYMMDDHHMMSS_description.sql`
- Auth: email/password via `supabase.auth`
- Storage bucket: `shipment-docs` — company-scoped paths
- Environment: `.env` (not committed) — `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`

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
| S1 | **IDOR**: every UPDATE/DELETE includes `.eq('company_id', activeCompanyId)` (company-scoped tables). Never rely solely on RLS as the only guard — defence in depth. |
| S2 | **Child table IDOR**: operations on tables without `company_id` (e.g. `journal_lines`, `licitacion_productos`, `sale_items`) must validate ownership via the parent row's `company_id` before mutating. |
| S3 | **XSS via URLs**: any field that renders as an `<a href>` must be validated with `/^https?:\/\//i` before rendering. Never render `javascript:` or `data:` URLs. |
| S4 | **Open redirect**: navigation targets derived from user input or URL params must be validated against an allowlist of internal routes. |
| S5 | **Injection in AI prompts**: text sent to Groq or any LLM must be sanitized (strip control characters) and length-limited. Never concatenate raw user HTML into prompts. |
| S6 | **RLS double-check**: any new Supabase table must have RLS enabled and at least one policy scoped to the authenticated user's company. |
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
