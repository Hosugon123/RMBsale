# Codex Project Guidance

## Verification Policy

Avoid expensive reruns for every small change.

- For copy-only UI text changes, do not run a full build by default. Rely on Vite hot reload and verify the affected page in the browser only when the page is already open or the user asks for visual confirmation.
- Run `npm.cmd run build` when TypeScript types, component props, imports, routing, data flow, API calls, database code, package files, or shared utilities change.
- Run targeted tests when business logic, money calculations, local storage behavior, or transaction/accounting behavior changes.
- Reload the in-app browser only when hot reload does not reflect the change, the page state is stale, or the change affects initial load/routing behavior.
- Before committing or preparing a release/deploy, run the full build even if individual edits were small.
