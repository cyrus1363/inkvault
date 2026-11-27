import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDoc,
  deleteDoc,
  exportDocx,
  exportMarkdown,
  exportProjectZip,
  exportTxt,
  moveDoc,
  safeFileName,
  updateDoc,
  type DocKind,
  type VaultData,
} from "@inkvault/core";
import {
  clearSessionKeys,
  encryptVaultData,
  loadStoredVault,
  persistVaultData,
  saveVaultToNativePath,
  type StoredVault,
} from "./vaultStore";
import { attachVaultFile, supportsFileAccess } from "./fileVault";
import { isTauri } from "./desktop";
import { download } from "./download";
import { AuthScreen } from "./AuthScreens";
import Binder from "./Binder";
import Editor from "./Editor";
import PromptPanel from "./PromptPanel";
import SettingsModal from "./SettingsModal";
import ReviseModal from "./ReviseModal";
import SnapshotsModal from "./SnapshotsModal";
import FindReplaceModal from "./FindReplaceModal";

type Screen = "loading" | "auth" | "home";

interface ReviseRequest {
  docId: string;
  start: number;
  end: number;
  selection: string;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [stored, setStored] = useState<StoredVault>();
  const [data, setData] = useState<VaultData>();
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [referenceDocId, setReferenceDocId] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [revise, setRevise] = useState<ReviseRequest | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [pendingInstruction, setPendingInstruction] = useState<{ text: string; nonce: number } | null>(null);

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

  async function handleSaveAsFile() {
    if (!stored || !data) return;
    try {
      if (isTauri()) {
        const path = await saveVaultToNativePath(stored.name, data);
        if (path) setSaveError(undefined);
      } else {
        const bytes = await encryptVaultData(data);
        await attachVaultFile(`${stored.name}.vault`, bytes);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save to file failed");
    }
  }

  function exportActive(format: "md" | "txt" | "docx") {
    if (!activeDoc) return;
    const base = safeFileName(activeDoc.title);
    if (format === "md") download(`${base}.md`, exportMarkdown(activeDoc), "text/markdown");
    else if (format === "txt") download(`${base}.txt`, exportTxt(activeDoc), "text/plain");
    else download(`${base}.docx`, exportDocx(activeDoc), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }

  function exportProject() {
    if (!data || !stored) return;
    download(`${safeFileName(stored.name)}.zip`, exportProjectZip(data), "application/zip");
  }

  if (screen === "loading") {
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );
  }
  if (screen === "auth" || !data || !stored) {
    return <AuthScreen stored={stored} onUnlocked={handleUnlocked} onStoredChanged={setStored} />;
  }

  const activeDoc = data.documents.find((d) => d.id === activeDocId && d.kind === "document") ?? null;
  const referenceDoc =
    data.documents.find((d) => d.id === referenceDocId && d.kind === "document") ?? null;
  const reviseDoc = revise ? data.documents.find((d) => d.id === revise.docId) ?? null : null;

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
        <details className="menu">
          <summary>Export</summary>
          <div className="menu-items">
            <button onClick={() => exportActive("md")} disabled={!activeDoc}>
              Document as .md
            </button>
            <button onClick={() => exportActive("txt")} disabled={!activeDoc}>
              Document as .txt
            </button>
            <button onClick={() => exportActive("docx")} disabled={!activeDoc}>
              Document as .docx
            </button>
            <button onClick={exportProject}>Whole project as .zip</button>
          </div>
        </details>
        <button onClick={() => setFindReplaceOpen(true)}>Find &amp; replace</button>
        {(supportsFileAccess() || isTauri()) && <button onClick={handleSaveAsFile}>Save .vault file</button>}
        <label className="small">
          <input type="checkbox" checked={splitView} onChange={(e) => setSplitView(e.target.checked)} /> Split
          view
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
            onBackslash={(selection, start, end) => {
              if (!activeDoc) return;
              if (selection) {
                setRevise({ docId: activeDoc.id, start, end, selection });
              } else {
                setPendingInstruction({
                  text: "Continue writing the document from where it ends. Match the established tone, style, and POV. Return only the new text.",
                  nonce: Date.now(),
                });
              }
            }}
            onSnapshot={() => {
              if (!activeDoc) return;
              updateData((d) => ({
                ...d,
                documents: d.documents.map((x) =>
                  x.id === activeDoc.id
                    ? { ...x, snapshots: [...(x.snapshots ?? [])], updatedAt: new Date().toISOString() }
                    : x,
                ),
              }));
              setHistoryOpen(true);
            }}
            onHistory={() => setHistoryOpen(true)}
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
          pendingInstruction={pendingInstruction}
        />
      </div>
      {settingsOpen && (
        <SettingsModal
          settings={data.settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(patch) => updateData((d) => ({ ...d, settings: { ...d.settings, ...patch } }))}
        />
      )}
      {revise && reviseDoc && (
        <ReviseModal
          data={data}
          doc={reviseDoc}
          start={revise.start}
          end={revise.end}
          selection={revise.selection}
          updateData={updateData}
          onClose={() => setRevise(null)}
        />
      )}
      {historyOpen && activeDoc && (
        <SnapshotsModal doc={activeDoc} updateData={updateData} onClose={() => setHistoryOpen(false)} />
      )}
      {findReplaceOpen && (
        <FindReplaceModal data={data} activeDoc={activeDoc} updateData={updateData} onClose={() => setFindReplaceOpen(false)} />
      )}
    </div>
  );
}
