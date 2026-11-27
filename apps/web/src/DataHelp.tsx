import { isTauri } from "./desktop";

/**
 * "Where is my data?" — plain-language explanation of the zero-knowledge storage model.
 * Text branches between web (browser IndexedDB + optional .vault file) and desktop
 * (a .vault file on disk). Keep the wording in sync with the actual storage code:
 * idb.ts (DB "inkvault", key "vault-file"), fileVault.ts (handle key "vault-handle"),
 * desktop.ts (Tauri vault_read/write + pick_vault_path).
 */
export default function DataHelpSection() {
  const desktop = isTauri();
  return (
    <details className="help">
      <summary>Where is my data?</summary>
      <div className="muted small">
        <p>
          Everything you write — documents, snapshots, generations, settings (including API keys) —
          is packed into a single project blob and encrypted on this device before it is stored
          anywhere. The key derived from your passphrase (and optional keyfile) never leaves this
          device, so the stored blob is unreadable without it.
        </p>
        {desktop ? (
          <p>
            <strong>Desktop app:</strong> the encrypted blob is a single <code>.vault</code> file on
            your disk. The app also keeps a copy in its local storage so you can reopen it quickly;
            use <em>Save .vault as…</em> to put the file wherever you like ( Documents, USB drive,
            a synced folder) — that file is your backup.
          </p>
        ) : (
          <p>
            <strong>Web app:</strong> the encrypted blob is stored in your browser's IndexedDB
            (database <code>inkvault</code>, key <code>vault-file</code>) — on this device only, not
            on any server. If you attach a <code>.vault</code> file, every save is also written
            through to that file, which you can keep anywhere as your backup.
          </p>
        )}
        <p>
          The static site that serves this app (GitHub Pages) never receives your vault, passphrase,
          keyfile, or texts. Text is sent to a third party only when you deliberately configure an AI
          provider (OpenRouter, Anthropic, or a custom endpoint) and run a generation; with the{" "}
          <em>local</em> provider nothing leaves this machine at all.
        </p>
        <p>
          There is no account and no telemetry. Back up your <code>.vault</code> file before
          clearing browser/site data on the web — that copy is the only one we keep for you.
          Forget the passphrase (and keyfile) and the vault cannot be recovered by anyone, by
          design.
        </p>
      </div>
    </details>
  );
}
