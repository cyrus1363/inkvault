# inkvault

Zero-knowledge, local-first AI writing app (working name). One shared frontend
codebase shipped to two targets:

- **Web** — static SPA (no backend; the server never sees manuscripts, keys, or API keys)
- **Desktop** — Tauri shell over the same code, adding direct file-system access
  and local model inference (llama.cpp / Ollama)

## Architecture

- `packages/core` — pure TypeScript, no framework. Vault crypto, document model,
  prompt compiler, provider clients. Runs identically in browser, Node, and the
  Tauri webview. Uses only the Web Crypto API.
- `packages/ui` — shared React components.
- `apps/web` — Vite static SPA.
- `apps/desktop` — Tauri v2 shell.

## Vault format (`.vault`)

Single encrypted container unlocked by a passphrase (optional keyfile for
"paranoid mode"):

```
[0..3]  magic "VLTW"
[4..5]  version, uint16 LE
[6..9]  header length, uint32 LE
[...]   header JSON: KDF params + salt, wrapped DEK (AES-256-GCM), content IV
[...]   ciphertext: AES-256-GCM over the JSON project state, keyed by the DEK
```

A random 256-bit data-encryption key (DEK) encrypts the content. The DEK is
wrapped by a key derived from the passphrase (PBKDF2-SHA-256, 600k iterations;
with a keyfile the KDF input is `SHA-256(passphrase || keyfile)`). KDF parameters
are pinned in the versioned header so the format can be upgraded later.

## Phase status

- **Phase 0 (done):** monorepo scaffold + vault crypto core with tests.
- **Phase 1 (done):** web MVP — vault unlock, binder (stable-ID tree,
  drag-and-drop, context toggles), editor with encrypted autosave, split view,
  prompt compiler with Preview/Last Prompt, streaming OpenRouter chat with
  live token/cost estimate, Stop, and mapped provider errors.
- **Phase 2 (done):** inline `\` continue + `[bracket]` revise with
  accept/reject diff hunks, version snapshots (cap 50, restore/compare),
  find & replace (doc or whole project), hotkey prompt library (Ctrl/Cmd+1–0),
  exports (.md/.txt/.docx/ZIP via a dependency-free ZIP writer), File System
  Access API save-to-`.vault`, PWA offline (service worker + manifest).
- **Phase 3 (in progress):** Tauri v2 desktop shell (`apps/desktop`) with native
  vault-file IO, native file picker, and a llama-server sidecar; local provider
  in core (OpenAI-compatible `http://127.0.0.1:*` endpoints — llama.cpp / Ollama),
  provider switch in the UI. Web app detects Tauri and uses native commands.
- **Phase 4 (in progress):** CI (GitHub Actions: npm ci + test + build),
  accessibility (dark/light/high-contrast themes, OpenDyslexic), pomodoro
  sprint timer, auto-lorebook injection (alias scan of the active scene, with
  excludable chips), kit-bash tabs (parallel takes), prompt chains.

## Commands

```
npm install
npm test     # runs workspace tests
npm run build
```
