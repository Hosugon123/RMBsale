# Codex Project Guidance

## Industry Practice First

The project maintainer is not a professional software engineer. For **non-trivial technical decisions**—accounting logic, algorithms, data consistency, security, infrastructure limits, or anything where the right pattern is unclear—**research how established products and vendors solve the same problem before implementing**.

1. **Look outward first**: Prefer patterns from accounting/fintech/ERP systems, official docs, and mature open-source projects over inventing custom flows.
2. **Document the choice briefly**: State the problem, the common industry approach, why this project adopts it, and trade-offs (in commit/PR notes or adjacent docs when the change is significant).
3. **Align with existing project decisions** when applicable (see README “非工程背景時的開發決策原則”): `decimal.js` + `numeric`, append-only ledger with reversal, RMB FIFO lots, Neon Pool (not HTTP) for transactions, Vercel physical API shims for nested routes.
4. **Validate with real money flows** after changes: deposit, withdrawal, purchase, sale, transfer, settlement—not UI-only checks.

Skip deep industry research only for obvious, low-risk edits (copy, styling, renaming) that do not affect business rules or system behavior.

## Git Sync Policy

At the start of every new operation, check whether the local branch is synchronized with GitHub before reading or editing project files. The maintainer often switches devices and uses multiple assistants, so stale local code is a real risk.

1. Run `git fetch origin` and inspect `git status --short --branch` before starting the actual task.
2. If the local branch is behind, pull the remote changes with a safe fast-forward workflow before making edits.
3. If the local branch has local changes or diverged history, do not overwrite anything. Report the state briefly and work with the existing changes, only asking the maintainer when the conflict blocks the task.
4. Mention when the repository was already synchronized so the maintainer knows the work started from the latest code.

## Verification Policy

Avoid expensive reruns for every small change.

- For copy-only UI text changes, do not run a full build by default. Rely on Vite hot reload and verify the affected page in the browser only when the page is already open or the user asks for visual confirmation.
- Run `npm.cmd run build` when TypeScript types, component props, imports, routing, data flow, API calls, database code, package files, or shared utilities change.
- Run targeted tests when business logic, money calculations, local storage behavior, or transaction/accounting behavior changes.
- Reload the in-app browser only when hot reload does not reflect the change, the page state is stale, or the change affects initial load/routing behavior.
- Before committing or preparing a release/deploy, run the full build even if individual edits were small.
- When the relevant tests and `npm.cmd run build` both pass, commit with a Traditional Chinese commit title and push the current branch to GitHub by default.
