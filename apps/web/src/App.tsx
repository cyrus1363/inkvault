import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDoc,
  deleteDoc,
  moveDoc,
  updateDoc,
  type DocKind,
  type VaultData,
} from "@inkvault/core";
import {
  clearSessionKeys,
  loadStoredVault,
  persistVaultData,
  type StoredVault,
} from "./vaultStore";
import { AuthScreen } from "./AuthScreens";
import Binder from "./Binder";
import Editor from "./Editor";
import PromptPanel from "./PromptPanel";
import SettingsModal from "./SettingsModal";

type Screen = "loading" | "auth" | "home";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [stored, setStored] = useState<StoredVault>();
  const [data, setData] = useState<VaultData>();
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [referenceDocId, setReferenceDocId] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  const dataRef = useRef<VaultData | undefined>(undefined);
  const storedRef = useRef<StoredVault | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  dataRef.current = data;
  storedRef.current = stored;

  useEffect(() => {
    loadStoredVault()
      .then((v) => {
        setStored(v);
        setScreen("auth");
      })
      .catch(() => setScreen("auth"));
  }, []);

  const updateData = useCallback((mutate: (d: VaultData) => VaultData) => {
    const prev = dataRef.current;
    if (!prev) return;
    const next: VaultData = { ...mutate(prev), updatedAt: new Date().toISOString() };
    dataRef.current = next;
    setData(next);
    setSaveError(undefined);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const s = storedRef.current;
      if (!s) return;
      persistVaultData(s, next)
        .then((ns) => {
          storedRef.current = ns;
          setStored(ns);
        })
        .catch(() => setSaveError("Autosave failed — vault locked or storage unavailable"));
    }, 800);
  }, []);

  function handleUnlocked(d: VaultData, s: StoredVault) {
    setData(d);
    setStored(s);
    setScreen("home");
  }

  function handleLock() {
    window.clearTimeout(saveTimer.current);
    clearSessionKeys();
    setData(undefined);
    setScreen("auth");
  }

  if (screen === "loading") {
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );
  }
  if (screen === "auth" || !data || !stored) {
    return <AuthScreen stored={stored} onUnlocked={handleUnlocked} />;
  }

  const activeDoc = data.documents.find((d) => d.id === activeDocId && d.kind === "document") ?? null;
  const referenceDoc =
    data.documents.find((d) => d.id === referenceDocId && d.kind === "document") ?? null;

  const handleAdd = (kind: DocKind, parentId: string | null) => {
    const { docs, doc } = addDoc(data.documents, {
      title: kind === "folder" ? "New folder" : "New document",
      kind,
      parentId,
    });
    updateData((d) => ({ ...d, documents: docs }));
    if (kind === "document") setActiveDocId(doc.id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <strong>{stored.name}</strong>
        <span className="muted small">{saveError ?? "autosaves locally, encrypted"}</span>
        <span className="spacer" />
        <label className="small">
          <input
            type="checkbox"
            checked={splitView}
            onChange={(e) => setSplitView(e.target.checked)}
          />{" "}
          Split view
        </label>
        <button onClick={() => setSettingsOpen(true)}>Settings</button>
        <button onClick={handleLock}>Lock</button>
      </header>
      <div className="main">
        <Binder
          docs={data.documents}
          activeDocId={activeDocId}
          onSelect={setActiveDocId}
          onAdd={handleAdd}
          onRename={(id, title) => updateData((d) => ({ ...d, documents: updateDoc(d.documents, id, { title }) }))}
          onDelete={(id) => {
            updateData((d) => ({ ...d, documents: deleteDoc(d.documents, id) }));
            if (activeDocId === id) setActiveDocId(null);
            if (referenceDocId === id) setReferenceDocId(null);
          }}
          onToggleContext={(id, enabled) =>
            updateData((d) => ({ ...d, documents: updateDoc(d.documents, id, { contextEnabled: enabled }) }))
          }
          onMove={(id, parentId, index) =>
            updateData((d) => ({ ...d, documents: moveDoc(d.documents, id, parentId, index) }))
          }
        />
        <div className="editor-area">
          <Editor
            doc={activeDoc}
            onChange={(content) =>
              activeDoc && updateData((d) => ({ ...d, documents: updateDoc(d.documents, activeDoc.id, { content }) }))
            }
            onRename={(title) =>
              activeDoc && updateData((d) => ({ ...d, documents: updateDoc(d.documents, activeDoc.id, { title }) }))
            }
          />
          {splitView && (
            <Editor doc={referenceDoc} docs={data.documents} readOnly onSelectDoc={setReferenceDocId} />
          )}
        </div>
        <PromptPanel
          data={data}
          activeDoc={activeDoc}
          updateData={updateData}
          onAppend={(text) => {
            if (!activeDoc) return;
            const sep = activeDoc.content && !activeDoc.content.endsWith("\n") ? "\n\n" : "";
            updateData((d) => ({
              ...d,
              documents: updateDoc(d.documents, activeDoc.id, { content: activeDoc.content + sep + text }),
            }));
          }}
        />
      </div>
      {settingsOpen && (
        <SettingsModal
          settings={data.settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(patch) => updateData((d) => ({ ...d, settings: { ...d.settings, ...patch } }))}
        />
      )}
    </div>
  );
}
