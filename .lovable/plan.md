# Plan: Rate History, Rent Review, PDF Export, WhatsApp & Approval Flow

## Step 1 — Monthly Electricity Rate Prompt

**DB**: New table `electricity_rates` (`month`, `year`, `rate_per_unit`). Owner-only RLS, all-auth read. Trigger or app-level cleanup keeps only the last 12 records.

**UI**: On owner dashboard mount, check if a row exists for current month/year. If not, show a modal "Set electricity rate per unit for {Month Year}" with number input + **Skip** + **Save**. Save inserts row + prunes >12 oldest. Skip just closes (will reappear next login).

**Bill calc**: Tenant `total_due` already pulls `rate_per_unit` from `settings`. Switch to: read current month's row from `electricity_rates`; fall back to `settings.electricity_rate_per_unit` if none set yet.

## Step 2 — Annual Rent & Charges Review (January)

**DB**: Add `last_reviewed_year` (int, nullable) column to `flats`.

**UI**: On owner login in January, fetch flats where `last_reviewed_year < currentYear OR null`. Show a modal that walks through each flat one at a time with pre-filled `rent` and `other_charges` inputs + **Save & Next** + **Skip**. Save updates the flat row and sets `last_reviewed_year = currentYear`. Skip moves on without marking reviewed (so it returns next login). Modal closes when queue is empty.

## Step 3 — History Tab + PDF Export + Owner Edit

**Tenant dashboard**: New `<Tabs>` shell with "Current" (existing UI) and "History". History lists last 12 months from `meter_readings`. Each row has **Export PDF** button.

**Owner dashboard**: New per-flat history drawer/dialog. Same 12-month list; each row has **Edit** to open form modifying every field (`prev_reading`, `curr_reading`, `units`, `rate_per_unit`, `electricity_bill`, `rent`, `other_charges`, `opening_balance`, `total_due`, `amount_paid`, `payment_status`).

**PDF**: Use `jspdf` (add via `bun add`). Generate client-side: header (Flat #, tenant name, month/year), reading table, bill breakdown, payment status footer.

## Step 4 — WhatsApp Confirmation

Replace current Yes/No payment modal text with: "Is your transaction successful? Send screenshot to owner for confirmation." On **Yes**:
1. Set the reading's `payment_status = 'pending_approval'` and store amount as `amount_paid` (provisional).
2. Open `https://wa.me/91{ownerMobile}?text={encoded message}` where message = `Payment done for Flat {X} - {Month} ₹{Amount}. Screenshot attached.`

Owner mobile pulled from `settings` (add `owner_mobile` column).

## Step 5 — Approval System

**DB**: Extend `payment_status` to allow `pending_approval` and `rejected` (it's a free `text` column today, so no enum change needed).

**Owner dashboard**: New "Pending Approvals" section listing all readings where `payment_status = 'pending_approval'`. Each shows flat #, tenant, month, amount with **Approve** (sets `paid` + `payment_timestamp`) and **Reject** (sets `rejected`, clears `amount_paid`).

**Tenant dashboard**: Status badge maps:
- `pending` → "Pending"
- `pending_approval` → "Pending Approval"
- `paid` → "Approved / Paid"
- `rejected` → "Rejected — please repay" (re-enable Pay button)

## Technical Details

**Migrations** (single migration):
- `CREATE TABLE electricity_rates (id, month int, year int, rate_per_unit numeric, created_at)` + RLS (owner ALL, authenticated SELECT) + unique(month, year).
- `ALTER TABLE flats ADD COLUMN last_reviewed_year int`.
- `ALTER TABLE settings ADD COLUMN owner_mobile text DEFAULT ''`.
- Helper SQL function `prune_electricity_rates()` that keeps newest 12 — called from app after insert, or run as trigger.

**New files**:
- `src/components/rate-prompt.tsx` — Step 1 modal
- `src/components/january-review.tsx` — Step 2 modal queue
- `src/components/history-list.tsx` — shared history list (tenant view)
- `src/components/owner-history-dialog.tsx` — Step 3 owner edit
- `src/components/edit-reading-dialog.tsx`
- `src/lib/pdf.ts` — `exportReadingPdf(reading, flat, settings)`
- `src/lib/rates.ts` — `getRateFor(month, year)` helper

**Edited files**:
- `src/routes/owner.tsx` — mount `<RatePrompt />`, `<JanuaryReview />`, "Pending Approvals" panel, history dialog launchers.
- `src/routes/tenant.tsx` — wrap in tabs, history tab, updated payment modal text & WhatsApp redirect, status mapping.
- `src/lib/billing.ts` — add `pending_approval` and `rejected` to `PaymentStatus` union + colors/labels.

**Dep**: `bun add jspdf jspdf-autotable`.

No edge functions needed — all logic runs client-side with RLS-protected Supabase queries.
