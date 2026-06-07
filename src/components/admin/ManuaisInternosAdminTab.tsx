import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import {
  createManualInterno,
  deleteManualInterno,
  getManualInternoDownloadUrl,
  listManuaisInternos,
  updateManualInternoMeta,
  type ManualInterno,
} from "../../lib/manuaisInternosDb";
import { useToast } from "../ui/ToastProvider";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeIcon(mime: string | null, isExternalLink?: boolean): React.ReactNode {
  if (isExternalLink)
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-xs font-bold text-sky-400">
        URL
      </span>
    );
  const m = (mime ?? "").toLowerCase();
  if (m.includes("pdf"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-xs font-bold text-red-400">
        PDF
      </span>
    );
  if (m.includes("word") || m.includes("document"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-blue-400">
        DOC
      </span>
    );
  if (m.includes("sheet") || m.includes("excel"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-xs font-bold text-emerald-400">
        XLS
      </span>
    );
  if (m.includes("presentation") || m.includes("powerpoint"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-xs font-bold text-orange-400">
        PPT
      </span>
    );
  if (m.includes("image"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-xs font-bold text-purple-400">
        IMG
      </span>
    );
  if (m.includes("zip") || m.includes("rar"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/15 text-xs font-bold text-yellow-400">
        ZIP
      </span>
    );
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700/60 text-xs font-bold text-slate-400">
      ARQ
    </span>
  );
}

function groupByCategory(manuals: ManualInterno[]): Map<string, ManualInterno[]> {
  const map = new Map<string, ManualInterno[]>();
  for (const m of manuals) {
    const list = map.get(m.category) ?? [];
    list.push(m);
    map.set(m.category, list);
  }
  return map;
}

// ─── upload modal ────────────────────────────────────────────────────────────

type FileEntry = { id: string; file: File; name: string };

type UploadModalProps = {
  existingCategories: string[];
  onClose: () => void;
  onUploaded: (manuals: ManualInterno[]) => void;
};

function CategorySelectorInterno({
  existingCategories, category, setCategory, newCategory, setNewCategory,
  useNewCategory, setUseNewCategory, disabled, multiFile,
}: {
  existingCategories: string[]; category: string; setCategory: (v: string) => void;
  newCategory: string; setNewCategory: (v: string) => void;
  useNewCategory: boolean; setUseNewCategory: (v: boolean) => void;
  disabled?: boolean; multiFile?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">
        Categoria{multiFile && <span className="ml-1 text-slate-600">(todos os arquivos)</span>}
      </label>
      {!useNewCategory && existingCategories.length > 0 ? (
        <div className="flex gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={disabled}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40 disabled:opacity-60">
            {existingCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" onClick={() => setUseNewCategory(true)} disabled={disabled}
            className="shrink-0 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-60">
            Nova
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Nome da categoria" disabled={disabled} required autoFocus
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40 disabled:opacity-60" />
          {existingCategories.length > 0 && (
            <button type="button" onClick={() => setUseNewCategory(false)} disabled={disabled}
              className="shrink-0 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-60">
              Voltar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UploadModal({ existingCategories, onClose, onUploaded }: UploadModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"files" | "link">("files");

  const [category, setCategory] = useState(existingCategories[0] ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [useNewCategory, setUseNewCategory] = useState(existingCategories.length === 0);
  const finalCategory = useNewCategory ? newCategory.trim() : category;

  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setFileEntries((prev) => [
      ...prev,
      ...picked.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name.replace(/\.[^.]+$/, ""),
      })),
    ]);
    e.target.value = "";
  }

  function updateName(id: string, name: string) {
    setFileEntries((prev) => prev.map((e) => (e.id === id ? { ...e, name } : e)));
  }

  function removeEntry(id: string) {
    setFileEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function handleLinkUrlChange(url: string) {
    setLinkUrl(url);
    if (!linkName) {
      try {
        const { hostname, pathname } = new URL(url);
        const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
        setLinkName(lastSegment ? decodeURIComponent(lastSegment) : hostname);
      } catch { /* ignore */ }
    }
  }

  async function handleSubmitFiles(e: React.FormEvent) {
    e.preventDefault();
    if (fileEntries.length === 0 || !finalCategory) return;
    setUploading(true);
    const uploaded: ManualInterno[] = [];
    for (let i = 0; i < fileEntries.length; i++) {
      const entry = fileEntries[i];
      setProgress({ current: i + 1, total: fileEntries.length });
      const { data, error } = await createManualInterno({
        name: entry.name.trim() || entry.file.name,
        category: finalCategory,
        file: entry.file,
        actorUserId: user?.id,
      });
      if (error || !data) {
        showToast({ message: `Erro ao enviar "${entry.name}": ${error?.message ?? "Erro desconhecido"}`, variant: "error" });
      } else {
        uploaded.push(data);
      }
    }
    setUploading(false);
    setProgress(null);
    if (uploaded.length > 0) {
      const total = fileEntries.length;
      const all = uploaded.length === total;
      showToast({
        message: all
          ? `${total} arquivo${total > 1 ? "s" : ""} enviado${total > 1 ? "s" : ""} com sucesso`
          : `${uploaded.length} de ${total} arquivo${total > 1 ? "s" : ""} enviado${uploaded.length > 1 ? "s" : ""}`,
        variant: all ? "success" : "warning",
      });
      onUploaded(uploaded);
    }
  }

  async function handleSubmitLink(e: React.FormEvent) {
    e.preventDefault();
    const trimUrl = linkUrl.trim();
    const trimName = linkName.trim();
    if (!trimUrl || !trimName || !finalCategory) return;
    setSavingLink(true);
    const { data, error } = await createManualInterno({
      name: trimName,
      category: finalCategory,
      externalUrl: trimUrl,
      actorUserId: user?.id,
    });
    setSavingLink(false);
    if (error || !data) {
      showToast({ message: `Erro ao adicionar link: ${error?.message ?? "Erro desconhecido"}`, variant: "error" });
      return;
    }
    showToast({ message: "Link adicionado com sucesso", variant: "success" });
    onUploaded([data]);
  }

  const busy = uploading || savingLink;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Adicionar manual interno</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 border-b border-slate-800 px-5 pt-3 pb-0">
          {(["files", "link"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-xs font-medium transition ${mode === m ? "border border-b-0 border-slate-700 bg-slate-900 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>
              {m === "files" ? (
                <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" /><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" /></svg>Arquivo(s)</>
              ) : (
                <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M8.914 6.025a.75.75 0 0 1 1.06 1.06L6.975 10.085a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757a.75.75 0 0 1 1.06 1.06l-1.757 1.757a3 3 0 0 0 4.243 4.243l2.999-3Z" /><path d="M7.086 9.975a.75.75 0 1 1-1.06-1.06l2.998-3a4.5 4.5 0 0 1 6.364 6.364l-1.757 1.757a.75.75 0 1 1-1.06-1.06l1.757-1.757a3 3 0 0 0-4.243-4.243l-2.999 3Z" /></svg>Link externo</>
              )}
            </button>
          ))}
        </div>

        {/* File mode */}
        {mode === "files" && (
          <form onSubmit={(e) => void handleSubmitFiles(e)} className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
            <div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesChange} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-600 px-4 py-3 text-left transition hover:border-slate-500 hover:bg-slate-800/40 disabled:opacity-50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0 text-slate-400">
                  <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06l-3.22-3.22V16.5a.75.75 0 01-1.5 0V4.81L8.03 8.03a.75.75 0 01-1.06-1.06l4.5-4.5zM3 15.75a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-slate-300">{fileEntries.length === 0 ? "Selecionar arquivos…" : "Adicionar mais arquivos…"}</span>
                {fileEntries.length > 0 && <span className="ml-auto shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-medium text-sky-400">{fileEntries.length}</span>}
              </button>
            </div>
            {fileEntries.length > 0 && (
              <div className="overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40">
                <div className="divide-y divide-slate-800/60">
                  {fileEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-8 shrink-0 text-center text-[9px] font-bold uppercase text-slate-600">{entry.file.name.split(".").pop()?.slice(0, 4) ?? "ARQ"}</span>
                      <input type="text" value={entry.name} onChange={(e) => updateName(entry.id, e.target.value)} disabled={uploading}
                        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-slate-200 outline-none transition focus:border-sky-500/50 focus:bg-slate-800/60 disabled:opacity-60" />
                      <span className="shrink-0 text-[10px] text-slate-600">{formatBytes(entry.file.size)}</span>
                      {!uploading && (
                        <button type="button" onClick={() => removeEntry(entry.id)} className="shrink-0 rounded p-1 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <CategorySelectorInterno existingCategories={existingCategories} category={category} setCategory={setCategory}
              newCategory={newCategory} setNewCategory={setNewCategory} useNewCategory={useNewCategory} setUseNewCategory={setUseNewCategory}
              disabled={uploading} multiFile={fileEntries.length > 1} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {progress ? `Enviando ${progress.current} de ${progress.total}…` : fileEntries.length > 0 ? `${fileEntries.length} arquivo${fileEntries.length > 1 ? "s" : ""} selecionado${fileEntries.length > 1 ? "s" : ""}` : ""}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} disabled={uploading} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={uploading || fileEntries.length === 0 || !finalCategory}
                  className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50">
                  {uploading && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>}
                  {uploading ? "Enviando…" : fileEntries.length > 1 ? `Enviar ${fileEntries.length} arquivos` : "Enviar"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Link mode */}
        {mode === "link" && (
          <form onSubmit={(e) => void handleSubmitLink(e)} className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">URL do link</label>
              <input type="url" value={linkUrl} onChange={(e) => handleLinkUrlChange(e.target.value)}
                placeholder="https://exemplo.com/manual.pdf" disabled={busy} autoFocus required
                className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40 disabled:opacity-60" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome de exibição</label>
              <input type="text" value={linkName} onChange={(e) => setLinkName(e.target.value)}
                placeholder="Ex: Procedimento Operacional Interno" disabled={busy} required
                className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40 disabled:opacity-60" />
            </div>
            <CategorySelectorInterno existingCategories={existingCategories} category={category} setCategory={setCategory}
              newCategory={newCategory} setNewCategory={setNewCategory} useNewCategory={useNewCategory} setUseNewCategory={setUseNewCategory}
              disabled={busy} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={busy || !linkUrl.trim() || !linkName.trim() || !finalCategory}
                className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50">
                {savingLink && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>}
                {savingLink ? "Salvando…" : "Adicionar link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── edit modal ──────────────────────────────────────────────────────────────

type EditModalProps = {
  manual: ManualInterno;
  existingCategories: string[];
  onClose: () => void;
  onSaved: (updated: ManualInterno) => void;
};

function EditModal({ manual, existingCategories, onClose, onSaved }: EditModalProps) {
  const { showToast } = useToast();
  const isLink = !!manual.externalUrl;
  const [name, setName] = useState(manual.name);
  const [externalUrl, setExternalUrl] = useState(manual.externalUrl ?? "");
  const [category, setCategory] = useState(manual.category);
  const [useNewCategory, setUseNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const finalCategory = useNewCategory ? newCategory.trim() : category;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !finalCategory) return;
    setSaving(true);
    const { data, error } = await updateManualInternoMeta(manual.id, {
      name: name.trim(),
      category: finalCategory,
      ...(isLink ? { externalUrl: externalUrl.trim() } : {}),
    });
    setSaving(false);
    if (error || !data) {
      showToast({ message: error?.message ?? "Erro ao salvar", variant: "error" });
      return;
    }
    showToast({ message: "Salvo com sucesso", variant: "success" });
    onSaved(data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">{isLink ? "Editar link" : "Editar arquivo interno"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5">
          {isLink && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">URL do link</label>
              <input type="url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} required
                className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40" />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome de exibição</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Categoria</label>
            {!useNewCategory ? (
              <div className="flex gap-2">
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40">
                  {existingCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => setUseNewCategory(true)}
                  className="shrink-0 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200">
                  Nova
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Nova categoria" required autoFocus
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40" />
                <button type="button" onClick={() => setUseNewCategory(false)}
                  className="shrink-0 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200">
                  Voltar
                </button>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200">Cancelar</button>
            <button type="submit" disabled={saving || !name.trim() || !finalCategory || (isLink && !externalUrl.trim())}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50">
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function ManuaisInternosAdminTab() {
  const { showToast } = useToast();
  const { canAction } = usePermissions();
  const [manuals, setManuals] = useState<ManualInterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [editTarget, setEditTarget] = useState<ManualInterno | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);

  const categories = [...new Set(manuals.map((m) => m.category))].sort();
  const grouped = groupByCategory(manuals);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listManuaisInternos();
    setLoading(false);
    if (error) {
      showToast({ message: "Erro ao carregar manuais internos", variant: "error" });
      return;
    }
    setManuals(data ?? []);
    // sections start closed by default
    setExpandedCategories(new Set());
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function handleUploaded(uploaded: ManualInterno[]) {
    setManuals((prev) =>
      [...prev, ...uploaded].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    );
    setExpandedCategories((prev) => new Set([...prev, ...uploaded.map((m) => m.category)]));
    setShowUpload(false);
  }

  function handleSaved(updated: ManualInterno) {
    setManuals((prev) =>
      prev
        .map((m) => (m.id === updated.id ? updated : m))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    );
    setExpandedCategories((prev) => new Set([...prev, updated.category]));
    setEditTarget(null);
  }

  async function handleDelete(manual: ManualInterno) {
    if (!confirm(`Excluir "${manual.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(manual.id);
    const { error } = await deleteManualInterno(manual.id);
    setDeletingId(null);
    if (error) {
      showToast({ message: error.message, variant: "error" });
      return;
    }
    showToast({ message: "Arquivo excluído", variant: "success" });
    setManuals((prev) => prev.filter((m) => m.id !== manual.id));
  }

  async function handleRenameCategory(oldCat: string, newCat: string) {
    const trimmed = newCat.trim();
    if (!trimmed || trimmed === oldCat) { setRenamingCategory(null); return; }
    const items = grouped.get(oldCat) ?? [];
    const results = await Promise.all(
      items.map((m) => updateManualInternoMeta(m.id, { name: m.name, category: trimmed })),
    );
    const updatedItems = results.flatMap((r) => (r.data ? [r.data] : []));
    const failed = results.filter((r) => !r.data).length;
    if (failed > 0) showToast({ message: `${failed} arquivo(s) não puderam ser renomeados`, variant: "error" });
    if (updatedItems.length > 0) {
      setManuals((prev) =>
        prev
          .map((m) => updatedItems.find((u) => u.id === m.id) ?? m)
          .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
      );
      setExpandedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(oldCat)) { next.delete(oldCat); next.add(trimmed); }
        return next;
      });
      showToast({ message: `Categoria renomeada para "${trimmed}"`, variant: "success" });
    }
    setRenamingCategory(null);
  }

  async function handleDeleteCategory(cat: string) {
    const items = grouped.get(cat) ?? [];
    const count = items.length;
    if (
      !confirm(
        `Excluir a categoria "${cat}" e ${count === 1 ? "o arquivo contido nela" : `os ${count} arquivos contidos nela`}? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setDeletingCategory(cat);
    const deletedIds: string[] = [];
    for (const m of items) {
      const { error } = await deleteManualInterno(m.id);
      if (error) showToast({ message: `Erro ao excluir "${m.name}"`, variant: "error" });
      else deletedIds.push(m.id);
    }
    setDeletingCategory(null);
    if (deletedIds.length > 0) {
      setManuals((prev) => prev.filter((m) => !deletedIds.includes(m.id)));
      showToast({
        message:
          deletedIds.length === count
            ? `Categoria "${cat}" excluída`
            : `${deletedIds.length} de ${count} arquivos excluídos`,
        variant: deletedIds.length === count ? "success" : "warning",
      });
    }
  }

  return (
    <>
      {showUpload && (
        <UploadModal
          existingCategories={categories}
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}
      {editTarget && (
        <EditModal
          manual={editTarget}
          existingCategories={categories}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Arquivos de uso interno — visíveis apenas para admins e instrutores.</p>
            <p className="text-xs text-slate-500">
              {manuals.length} {manuals.length === 1 ? "arquivo" : "arquivos"} em {categories.length}{" "}
              {categories.length === 1 ? "categoria" : "categorias"}
            </p>
          </div>
          {canAction("content.edit") ? (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Adicionar
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-800/60" />
            ))}
          </div>
        ) : manuals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-12 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto mb-3 h-10 w-10 text-slate-700">
              <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
            </svg>
            <p className="text-sm font-medium text-slate-400">Nenhum arquivo interno ainda</p>
            <p className="mt-1 text-xs text-slate-600">Clique em "Adicionar" para incluir o primeiro manual interno.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const items = grouped.get(cat) ?? [];
              const isOpen = expandedCategories.has(cat);
              const isRenaming = renamingCategory === cat;
              return (
                <div key={cat} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
                  {/* Category header */}
                  <div
                    role={!isRenaming ? "button" : undefined}
                    tabIndex={!isRenaming ? 0 : undefined}
                    onClick={() => { if (!isRenaming) toggleCategory(cat); }}
                    onKeyDown={(e) => { if (!isRenaming && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleCategory(cat); } }}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 transition ${!isRenaming ? "cursor-pointer hover:bg-slate-800/40" : "bg-slate-800/20"}`}
                  >
                    {/* Folder icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-400">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>

                    {/* Rename form or static name */}
                    {isRenaming ? (
                      <form
                        className="flex flex-1 items-center gap-2"
                        onSubmit={(e) => { e.preventDefault(); void handleRenameCategory(cat, renameValue); }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setRenamingCategory(null); } }}
                          autoFocus
                          className="flex-1 rounded-lg border border-sky-500/50 bg-slate-800/80 px-2.5 py-1 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sky-500/40"
                        />
                        <button
                          type="submit"
                          disabled={!renameValue.trim()}
                          className="rounded-lg p-1.5 text-sky-400 transition hover:bg-sky-500/10 disabled:opacity-40"
                          title="Confirmar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setRenamingCategory(null); }}
                          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-300"
                          title="Cancelar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                          </svg>
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-slate-200">{cat}</span>
                        <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                          {items.length}
                        </span>
                      </>
                    )}

                    {/* Admin actions (hidden while renaming) */}
                    {canAction("content.edit") && !isRenaming && (
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { setRenamingCategory(cat); setRenameValue(cat); }}
                          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-700 hover:text-slate-300"
                          title="Renomear categoria"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 3.5A2.25 2.25 0 0 0 2.5 5.75v5.5A2.25 2.25 0 0 0 4.75 13.5h5.5A2.25 2.25 0 0 0 12.5 11.25v-2.5a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 1-.75.75h-5.5a.75.75 0 0 1-.75-.75v-5.5a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 0 0-1.5h-2.5Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(cat)}
                          disabled={deletingCategory === cat}
                          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                          title="Excluir categoria e todos os arquivos"
                        >
                          {deletingCategory === cat ? (
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                              <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Chevron (hidden while renaming) */}
                    {!isRenaming && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      >
                        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>

                  {/* Files list */}
                  {isOpen && !isRenaming && (
                    <div className="divide-y divide-slate-800/60 border-t border-slate-800/60">
                      {items.map((m) => {
                        const isLink = !!m.externalUrl;
                        const downloadUrl = isLink ? null : getManualInternoDownloadUrl(m.fileId);
                        return (
                          <div key={m.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-800/30">
                            {fileTypeIcon(m.mimeType, isLink)}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-200">{m.name}</p>
                              <p className="truncate text-xs text-slate-500">
                                {isLink ? m.externalUrl : `${m.originalName}${m.fileSize ? ` · ${formatBytes(m.fileSize)}` : ""}`}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {isLink ? (
                                <a href={m.externalUrl!} target="_blank" rel="noreferrer"
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200" title="Abrir link">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                    <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                                    <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                                  </svg>
                                </a>
                              ) : downloadUrl ? (
                                <a href={downloadUrl} download={m.originalName} target="_blank" rel="noreferrer"
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200" title="Baixar">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                                  </svg>
                                </a>
                              ) : null}
                              {canAction("content.edit") && (
                                <button type="button" onClick={() => setEditTarget(m)}
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200" title="Editar">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                    <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                  </svg>
                                </button>
                              )}
                              {canAction("content.edit") && (
                                <button type="button" onClick={() => void handleDelete(m)} disabled={deletingId === m.id}
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40" title="Excluir">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
