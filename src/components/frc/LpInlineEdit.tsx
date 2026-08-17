import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { BUCKET_ID, ID, NOTICES_BUCKET_ID, Permission, Role, storage } from "../../lib/appwrite";

export async function uploadLpAsset(file: File): Promise<string> {
  const bucketId = NOTICES_BUCKET_ID ?? BUCKET_ID;
  if (!storage || !bucketId) throw new Error("Upload de imagem não configurado.");
  const uploaded = await storage.createFile(bucketId, ID.unique(), file, [Permission.read(Role.any())]);
  return storage.getFileView(bucketId, uploaded.$id).toString();
}

type TextTag = "p" | "h1" | "h2" | "h3" | "span";

export function EditableText({
  as: Tag = "p",
  value,
  onChange,
  editing,
  multiline = false,
  className = "",
  maxLength,
}: {
  as?: TextTag;
  value: string;
  onChange: (value: string) => void;
  editing: boolean;
  multiline?: boolean;
  className?: string;
  maxLength?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!editing || !ref.current) return;
    if (ref.current.textContent !== value) ref.current.textContent = value;
  }, [editing, value]);

  if (!editing) return <Tag className={className}>{value}</Tag>;

  return (
    <Tag
      ref={ref as never}
      className={`${className} cursor-text rounded-md outline outline-1 outline-dashed outline-sky-400/40 hover:bg-sky-400/5 hover:outline-sky-300 focus:bg-sky-400/10 focus:outline-sky-300`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline}
      onBlur={(event: FocusEvent<HTMLElement>) => {
        const next = (event.currentTarget.textContent ?? "").replace(/\u00a0/g, " ").trim();
        const clipped = maxLength ? next.slice(0, maxLength) : next;
        if (clipped !== value) onChange(clipped);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (!multiline && event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    >
      {value}
    </Tag>
  );
}

export function EditableImage({
  editing,
  src,
  onUpload,
  onClear,
  uploading = false,
  label = "Trocar imagem",
  children,
}: {
  editing: boolean;
  src?: string;
  onUpload: (file: File) => void;
  onClear?: () => void;
  uploading?: boolean;
  label?: string;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      {src ? (
        <div className="aspect-[16/10] bg-slate-900">
          <img src={src} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        children
      )}
      {editing ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-slate-950/80 to-transparent p-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-sky-300 px-3 py-1.5 text-xs font-black text-slate-950 shadow-lg"
          >
            {uploading ? "Enviando..." : src ? label : "Adicionar print"}
          </button>
          {src && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-white/20 bg-slate-950/80 px-3 py-1.5 text-xs font-bold text-white"
            >
              Usar mockup
            </button>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function LpEditBar({
  editing,
  canEdit,
  saving,
  dirty,
  message,
  onStart,
  onSave,
  onCancel,
}: {
  editing: boolean;
  canEdit: boolean;
  saving: boolean;
  dirty: boolean;
  message: string | null;
  onStart: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!canEdit) return null;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={onStart}
        className="fixed bottom-5 right-5 z-[80] rounded-full bg-sky-300 px-4 py-2.5 text-sm font-black text-slate-950 shadow-2xl shadow-sky-950/40 hover:bg-sky-200"
      >
        Editar página
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-sky-400/30 bg-slate-950/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">Modo edição</p>
          <p className="text-xs text-slate-400">
            Clique nos textos, chips, cards e prints para alterar. Use + Print para adicionar imagens no carrossel.
          </p>
          {message ? <p className="mt-1 text-xs text-amber-200">{message}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            className="rounded-lg bg-sky-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-sky-200 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
