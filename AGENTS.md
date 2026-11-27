# AGENTS.md — conventions for this repo

- TypeScript strict, ESM, `module: NodeNext` — relative imports use `.js` suffixes.
- `packages/core` must stay dependency-free at runtime and use **only the Web
  Crypto API** (`globalThis.crypto`) — no `node:crypto` — so the same code runs
  in the browser, Node, and the Tauri webview. The Tauri Rust side must implement
  the identical vault format/params.
- Tests: vitest, colocated in `packages/*/test/`. Crypto tests must use a low
  PBKDF2 iteration override except for the single test that validates the real
  default parameters.
- Do not add dependencies unless the package already uses them or the plan calls
  for them. Every dependency is supply-chain surface for a privacy product.
- No comments in code unless explaining a non-obvious crypto decision.
- Vault binary format changes require a version bump in `VAULT_VERSION` and a
  migration path in `openVault`.
