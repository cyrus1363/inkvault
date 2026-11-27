import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDoc,
  deleteDoc,
  duplicateDoc,
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
  ensureDesktopVault,
  loadStoredVault,
  persistVaultData,
  saveVaultToNativePath,
  type StoredVault,
} from "./vaultStore";
import { attachVaultFile, supportsFileAccess } from "./fileVault";
import { isTauri } from "./desktop";
import { Mascot } from "./mascots";
import type { ThemeName } from "@inkvault/core";
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
      .then(async (v) => {
        // Desktop first run: fall back to the default vault in the OS app-data dir.
        const s = v ?? (await ensureDesktopVault());
        setStored(s);
        setScreen("auth");
      })
      .catch(() => setScreen("auth"));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = data?.settings.theme ?? "lofi";
    document.body.classList.toggle("font-dyslexic", data?.settings.font === "dyslexic");
  }, [data?.settings.theme, data?.settings.font]);

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
        <Mascot theme={data.settings.theme} size={26} />
        <strong>{stored.name}</strong>
        <select
          className="theme-quick"
          value={data.settings.theme}
          title="Theme"
          onChange={(e) => updateData((d) => ({ ...d, settings: { ...d.settings, theme: e.target.value as ThemeName } }))}
        >
          <option value="lofi">lofi 🦉</option>
          <option value="synthwave">synthwave 🐱</option>
          <option value="dark">dark</option>
          <option value="light">light</option>
          <option value="high-contrast">high contrast</option>
        </select>
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
        <Pomodoro />
        <button
          onClick={() => updateData((d) => ({ ...d, settings: { ...d.settings, zenMode: !d.settings.zenMode } }))}
          title="Hide binder and prompt panel (distraction-free)"
        >
          {data.settings.zenMode ? "Exit zen" : "Zen"}
        </button>
        <button onClick={() => setSettingsOpen(true)}>Settings</button>
        <button onClick={handleLock}>Lock</button>
      </header>
      <div className={"main" + (data.settings.zenMode ? " zen" : "")}>
        {!data.settings.zenMode && (
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
          onDuplicate={(id) => updateData((d) => ({ ...d, documents: duplicateDoc(d.documents, id) }))}
          onToggleLock={(id, locked) =>
            updateData((d) => ({ ...d, documents: updateDoc(d.documents, id, { locked }) }))
          }
        />
        )}
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
            onUnlock={() =>
              activeDoc &&
              updateData((d) => ({ ...d, documents: updateDoc(d.documents, activeDoc.id, { locked: false }) }))
            }
          />
          {splitView && (
            <Editor doc={referenceDoc} docs={data.documents} readOnly onSelectDoc={setReferenceDocId} />
          )}
        </div>
        {!data.settings.zenMode && (
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
        )}
      </div>
      {settingsOpen && (
        <SettingsModal
          settings={data.settings}
          docs={data.documents}
          onClose={() => setSettingsOpen(false)}
          onSave={(patch) => updateData((d) => ({ ...d, settings: { ...d.settings, ...patch } }))}
          onSaveAliases={(docId, list) =>
            updateData((d) => ({
              ...d,
              documents: updateDoc(d.documents, docId, { loreAliases: list }),
            }))
          }
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

function Pomodoro() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (seconds === 0) setRunning(false);
  }, [seconds]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span className="pomodoro small">
      <button onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Sprint"}</button>
      <button onClick={() => { setRunning(false); setSeconds(25 * 60); }}>Reset</button>
      <span>{mm}:{ss}</span>
    </span>
  );
}
