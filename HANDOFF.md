# RMBsale Handoff

This file is a short handoff for the next assistant taking over development.

## Current Product Shape

- This is a React + TypeScript + Vite demo app for RMB/TWD cashflow tracking.
- Main routes already exist for purchases, sales, receivables, accounts, inventory, ledger, and admin.
- Local data lives in `localStorage` and is seeded from `src/lib/localStore.ts`.

## Current UI Conventions

- Dashboard metric cards are clickable when they should open a drill-down view.
- `總 TWD 餘額`, `總 RMB 餘額`, `客戶應收`, and `利潤` all open dedicated modals.
- `近期現金流水` is the main consolidated flow table on the dashboard.
- `利潤` no longer has a permanent standalone card section; profit income is integrated into the cashflow table and can also be opened as a modal from the dashboard card.
- Directional amounts use signs:
  - `in` => `+`
  - `out` => `-`
  - neutral => no sign

## Important Files

- `src/pages/DashboardPage.tsx`
  - Dashboard cards and modal drill-downs.
  - Contains the integrated recent cashflow table.
- `src/components/MetricCard.tsx`
  - Supports optional `onClick` so metric cards can be drill-down triggers.
- `src/lib/utils.ts`
  - `fmtMoney`, `fmtDirectionalMoney`, `fmtRate`.
- `src/lib/localStore.ts`
  - Seed state, totals, ledger mutation helpers, profit calculation helpers.
  - `totals(state)` currently computes:
    - `twd` from all TWD accounts
    - `rmb` from all RMB accounts
    - `receivable` from all customers
    - `inventory` from remaining RMB lots
    - `profit` as sale profit minus profit withdrawals
  - `profitLedger(state)` returns profit income and profit withdrawals as a separate derived list.
- `src/pages/AccountsPage.tsx`
  - Account cards include compact deposit/withdraw controls.
  - TWD withdraw has a dropdown for `撤資` vs `分潤`.
- `src/pages/LedgerPage.tsx`
  - General ledger view and CSV export.

## Current Business Rules

- Selling RMB creates:
  - a sale record,
  - receivable TWD,
  - profit for that sale,
  - account ledger mutation for the RMB account.
- Profit is treated as its own logical pool:
  - sale profit is counted as profit income,
  - profit withdrawals reduce both the profit total and the relevant TWD account balance,
  - capital withdrawals reduce only the account balance.
- Cashflow and ledger displays should keep profit income and profit withdrawal visible, with signs.

## Development Workflow We Are Using

- For copy-only UI text changes, prefer hot reload verification instead of full build.
- For state flow, accounting rules, type changes, or shared utilities, run tests and then build.
- If a change affects dashboard totals, account balances, or ledger logic, verify in-browser after the code change.
- Use `apply_patch` for edits.
- The workspace sometimes shows garbled Chinese in terminal output; when patching, prefer locating by stable surrounding code or with `Select-String`.

## Recent UX Decisions

- Dashboard metric cards are clickable drill-downs.
- `利潤` opens a modal listing profit income and profit withdrawals.
- `總 TWD 餘額` opens TWD-only flow history.
- `總 RMB 餘額` opens RMB-only flow history.
- `客戶應收` opens a full receivable history for all customers.
- Negative amounts show a `-` sign, positive amounts show `+`.

## Verification Status

- Build currently passes.
- The dashboard drill-downs for TWD, RMB, profit, and receivables were verified in the in-app browser.

## Notes For The Next Assistant

- Keep the dashboard compact; the user prefers drill-downs over permanent extra sections.
- Do not ask the user to confirm routine implementation steps; use judgment and proceed.
- If you need to touch accounting logic, make sure tests cover the change.
- If you need to patch a Chinese-labeled file and the terminal output looks corrupted, search by nearby structural lines rather than the visible label text.
