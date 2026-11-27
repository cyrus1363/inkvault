import { useState } from "react";
import { peekVault, VaultError, type VaultData } from "@inkvault/core";
import { loadStoredVault, saveNewVault, unlockVault, type StoredVault } from "./vaultStore";

export function AuthScreen({
  stored,
  onUnlocked,
}: {
  stored?: StoredVault;
  onUnlocked: (data: VaultData, stored: StoredVault) => void;
}) {
  const [mode, setMode] = useState<"unlock" | "create">(stored ? "unlock" : "create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function handleUnlock(passphrase: string, keyfile?: Uint8Array) {
    if (!stored) return;
    setBusy(true);
    setError(undefined);
    try {
      onUnlocked(await unlockVault(stored, passphrase, keyfile), stored);
    } catch (err) {
      setError(err instanceof VaultError ? err.message : "Failed to open vault");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(name: string, passphrase: string, keyfile?: Uint8Array) {
    setBusy(true);
    setError(undefined);
    try {
      const data = await saveNewVault(name, passphrase, keyfile);
      const s = await loadStoredVault();
      if (!s) throw new Error("Vault was not persisted");
      onUnlocked(data, s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create vault");
    } finally {
      setBusy(false);
    }
  }

  const needsKeyfile = stored ? peekVault(new Uint8Array(stored.bytes)).hasKeyfile : false;
  if (mode === "create") {
    return (
      <CreateForm
        busy={busy}
        error={error}
        canSwitchToUnlock={!!stored}
        onCreate={handleCreate}
        onSwitchToUnlock={() => setMode("unlock")}
      />
    );
  }
  return (
    <UnlockForm
      busy={busy}
      error={error}
      needsKeyfile={needsKeyfile}
      canCreate={!stored}
      onUnlock={handleUnlock}
      onSwitchToCreate={() => setMode("create")}
    />
  );
}

function KeyfileInput({ onKeyfile }: { onKeyfile: (keyfile: Uint8Array | undefined) => void }) {
  return (
    <label>
      Keyfile (optional)
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) {
            onKeyfile(undefined);
            return;
          }
          file.arrayBuffer().then((buf) => onKeyfile(new Uint8Array(buf)));
        }}
      />
    </label>
  );
}

function UnlockForm({
  busy,
  error,
  needsKeyfile,
  canCreate,
  onUnlock,
  onSwitchToCreate,
}: {
  busy: boolean;
  error?: string;
  needsKeyfile: boolean;
  canCreate: boolean;
  onUnlock: (passphrase: string, keyfile?: Uint8Array) => void;
  onSwitchToCreate: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [keyfile, setKeyfile] = useState<Uint8Array | undefined>(undefined);

  return (
    <main className="screen">
      <h1>Unlock vault</h1>
      {needsKeyfile && <p className="muted">This vault requires a keyfile.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onUnlock(passphrase, keyfile);
        }}
      >
        <label>
          Passphrase
          <input
            type="password"
            autoFocus
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </label>
        <KeyfileInput onKeyfile={setKeyfile} />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !passphrase}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        {canCreate && (
          <button type="button" onClick={onSwitchToCreate}>
            Create a new vault instead
          </button>
        )}
      </form>
    </main>
  );
}

function CreateForm({
  busy,
  error,
  canSwitchToUnlock,
  onCreate,
  onSwitchToUnlock,
}: {
  busy: boolean;
  error?: string;
  canSwitchToUnlock: boolean;
  onCreate: (name: string, passphrase: string, keyfile?: Uint8Array) => void;
  onSwitchToUnlock: () => void;
}) {
  const [name, setName] = useState("My Novel");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [keyfile, setKeyfile] = useState<Uint8Array | undefined>(undefined);
  const [localError, setLocalError] = useState<string>();

  return (
    <main className="screen">
      <h1>Create a vault</h1>
      <p className="muted">
        Everything is encrypted on this device before it is stored. The server never sees your work.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (passphrase !== confirm) {
            setLocalError("Passphrases do not match");
            return;
          }
          setLocalError(undefined);
          onCreate(name, passphrase, keyfile);
        }}
      >
        <label>
          Vault name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Passphrase
          <input type="password" autoFocus value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </label>
        <label>
          Confirm passphrase
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <KeyfileInput onKeyfile={setKeyfile} />
        {(localError ?? error) && <p className="error">{localError ?? error}</p>}
        <button type="submit" disabled={busy || !passphrase || !name}>
          {busy ? "Encrypting…" : "Create vault"}
        </button>
        {canSwitchToUnlock && (
          <button type="button" onClick={onSwitchToUnlock}>
            Open existing vault instead
          </button>
        )}
      </form>
    </main>
  );
}
