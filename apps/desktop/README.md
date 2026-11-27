# @inkvault/desktop

Tauri v2 shell around `apps/web`. One codebase, two targets: this binary adds
native vault-file IO and local model servers; everything else is the shared web app.

## Rust commands (invoked from the webview via `@tauri-apps/api`)

| Command | Purpose |
| --- | --- |
| `vault_write(path, bytes)` / `vault_read(path)` | Native `.vault` file IO (bypasses the browser picker) |
| `pick_vault_path(save)` | Native open/save dialog (rfd) |
| `start_local_server(bin, model, port, host)` | Spawn `llama-server` sidecar (single instance, tracked in a Mutex) |
| `stop_local_server()` / `server_running()` | Manage the sidecar lifecycle |

## Build

```
npm install          # from repo root
npm run build -w @inkvault/web
npm run build -w @inkvault/desktop    # tauri build (needs webkit2gtk on Linux)
npm run dev -w @inkvault/desktop      # tauri dev against the vite dev server
```

The vault format is implemented identically in `packages/core` (Web Crypto) and
must stay byte-compatible with any future Rust-side reader — do not change
`VAULT_VERSION` without a migration path.
