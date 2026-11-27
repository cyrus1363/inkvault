import { useEffect, useState } from "react";
import { peekVault, VaultError, type VaultData } from "@inkvault/core";
import {
  clearSessionKeys,
  loadStoredVault,
  persistVaultData,
  saveNewVault,
  unlockVault,
  type StoredVault,
} from "./vaultStore";

type Screen = "loading" | "unlock" | "create" | "home";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [stored, setStored] = useState<StoredVault | undefined>(undefined);
  const [data, setData] = useState<VaultData | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadStoredVault()
      .then((v) => {
        setStored(v);
        setScreen(v ? "unlock" : "create");
      })
      .catch(() => setScreen("create"));
  }, []);

  async function handleUnlock(passphrase: string, keyfile?: Uint8Array) {
    if (!stored) return;
    setBusy(true);
    setError(undefined);
    try {
      setData(await unlockVault(stored, passphrase, keyfile));
      setScreen("home");
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
      setData(await saveNewVault(name, passphrase, keyfile));
      setStored(await loadStoredVault());
      setScreen("home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create vault");
    } finally {
      setBusy(false);
    }
  }

  async function handleAutosave(next: VaultData) {
    if (!stored) return;
    setData(next);
    try {
      setStored(await persistVaultData(stored, next));
    } catch {
      setError("Autosave failed — vault is locked or storage is unavailable");
    }
  }

  function handleLock() {
    clearSessionKeys();
    setData(undefined);
    setScreen("unlock");
  }

  if (screen === "loading") {
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );
  }

  if (screen === "home" && data && stored) {
    return (
      <main className="screen">
        <h1>{stored.name}</h1>
        <p className="muted">
          Vault unlocked · schema v{data.schema} · updated {data.updatedAt}
        </p>
        <p>Editor and binder land in the next phase.</p>
        <button onClick={handleLock}>Lock vault</button>
      </main>
    );
  }

  if (screen === "create") {
    return (
      <CreateForm
        busy={busy}
        error={error}
        canSwitchToUnlock={!!stored}
        onCreate={handleCreate}
        onSwitchToUnlock={() => setScreen("unlock")}
      />
    );
  }

  const needsKeyfile = stored ? peekVault(new Uint8Array(stored.bytes)).hasKeyfile : false;
  return <UnlockForm busy={busy} error={error} needsKeyfile={needsKeyfile} onUnlock={handleUnlock} />;
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
  onUnlock,
}: {
  busy: boolean;
  error?: string;
  needsKeyfile: boolean;
  onUnlock: (passphrase: string, keyfile?: Uint8Array) => void;
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
  const [localError, setLocalError] = useState<string | undefined>(undefined);

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
        {(localError || error) && <p className="error">{localError ?? error}</p>}
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
