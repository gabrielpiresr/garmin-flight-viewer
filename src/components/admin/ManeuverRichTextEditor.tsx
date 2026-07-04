import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { getManeuverEditorExtensions, MANEUVER_EDITOR_SURFACE_CLASS } from "../../lib/maneuverContent";
import type { ManeuverMediaUpload, ManeuverRichContent } from "../../types/maneuver";

type ManeuverRichTextEditorProps = {
  value: ManeuverRichContent;
  onChange: (value: ManeuverRichContent) => void;
  onUploadMedia: (file: File) => Promise<ManeuverMediaUpload | null>;
  disabled?: boolean;
  placeholder?: string;
};

function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

export function ManeuverRichTextEditor({
  value,
  onChange,
  onUploadMedia,
  disabled = false,
  placeholder = "Escreva o artigo da manobra...",
}: ManeuverRichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextContentSyncRef = useRef(false);
  const [, setEditorRevision] = useState(0);
  const extensions = useMemo(() => getManeuverEditorExtensions(placeholder), [placeholder]);
  const editor = useEditor({
    extensions,
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      skipNextContentSyncRef.current = true;
      onChange(currentEditor.getJSON() as ManeuverRichContent);
    },
    editorProps: {
      attributes: {
        class: MANEUVER_EDITOR_SURFACE_CLASS,
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const image = files.find((file) => file.type.startsWith("image/"));
        if (!image) return false;
        event.preventDefault();
        void handleMediaFile(image);
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const refresh = () => setEditorRevision((current) => current + 1);
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (skipNextContentSyncRef.current) {
      skipNextContentSyncRef.current = false;
      return;
    }
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(value)) return;
    editor.commands.setContent(value);
  }, [editor, value]);

  async function handleMediaFile(file: File | null) {
    if (!file || !editor) return;
    const uploaded = await onUploadMedia(file);
    if (!uploaded) return;
    if (uploaded.mimeType.startsWith("image/")) {
      editor.chain().focus().insertContent({ type: "image", attrs: { src: uploaded.url, alt: uploaded.name, width: "100%" } }).run();
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: "videoEmbed", attrs: { src: uploaded.url, title: uploaded.name } })
      .run();
  }

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function addVideoUrl() {
    if (!editor) return;
    const url = window.prompt("URL do vídeo (YouTube, Vimeo ou arquivo MP4/WebM)");
    if (!url?.trim()) return;
    if (isYoutubeUrl(url)) {
      editor.commands.setYoutubeVideo({ src: url.trim(), width: 960, height: 540 });
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: "videoEmbed", attrs: { src: url.trim(), title: "Video" } })
      .run();
  }

  function deleteTable() {
    if (!editor) return;
    editor.chain().focus().deleteTable().run();
  }

  function runTableCommand(run: () => boolean) {
    if (!editor) return;
    run();
  }

  const isInTable = editor?.isActive("table") ?? false;
  const canDeleteTable = editor?.can().deleteTable() ?? false;
  const canAddRowBefore = editor?.can().addRowBefore() ?? false;
  const canAddRowAfter = editor?.can().addRowAfter() ?? false;
  const canDeleteRow = editor?.can().deleteRow() ?? false;
  const canAddColumnBefore = editor?.can().addColumnBefore() ?? false;
  const canAddColumnAfter = editor?.can().addColumnAfter() ?? false;
  const canDeleteColumn = editor?.can().deleteColumn() ?? false;

  const buttonClass = "rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40";
  const activeClass = "border-sky-500/60 bg-sky-500/10 text-sky-200";
  const bubbleButtonClass = "rounded-md px-2 py-1 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-40";

  return (
    <div className="rounded-xl">
      <div className="flex flex-wrap gap-1 rounded-t-xl border border-slate-700 bg-slate-900/80 p-2">
        <button type="button" disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleBold().run()} className={`${buttonClass} ${editor?.isActive("bold") ? activeClass : ""}`}>
          Negrito
        </button>
        <button type="button" disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleItalic().run()} className={`${buttonClass} ${editor?.isActive("italic") ? activeClass : ""}`}>
          Itálico
        </button>
        <button type="button" disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`${buttonClass} ${editor?.isActive("heading", { level: 2 }) ? activeClass : ""}`}>
          Título
        </button>
        <button type="button" disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`${buttonClass} ${editor?.isActive("bulletList") ? activeClass : ""}`}>
          Lista
        </button>
        <button type="button" disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`${buttonClass} ${editor?.isActive("orderedList") ? activeClass : ""}`}>
          Numerada
        </button>
        <button
          type="button"
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleList("squareList", "squareListItem").run()}
          className={`${buttonClass} ${editor?.isActive("squareList") ? activeClass : ""}`}
        >
          Checklist
        </button>
        <button type="button" disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={`${buttonClass} ${editor?.isActive("blockquote") ? activeClass : ""}`}>
          Destaque
        </button>
        <button type="button" disabled={!editor || disabled} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className={buttonClass}>
          Tabela
        </button>
        <button
          type="button"
          disabled={!editor || disabled || !canDeleteTable}
          onClick={deleteTable}
          className={`${buttonClass} ${isInTable ? "border-red-700/50 text-red-300 hover:bg-red-500/10" : ""}`}
        >
          Excluir tabela
        </button>
        <button
          type="button"
          disabled={!editor || disabled || !canAddRowBefore}
          onClick={() => runTableCommand(() => editor!.chain().focus().addRowBefore().run())}
          className={buttonClass}
          title="Adicionar linha acima"
        >
          Linha ↑
        </button>
        <button
          type="button"
          disabled={!editor || disabled || !canAddRowAfter}
          onClick={() => runTableCommand(() => editor!.chain().focus().addRowAfter().run())}
          className={buttonClass}
          title="Adicionar linha abaixo"
        >
          Linha ↓
        </button>
        <button
          type="button"
          disabled={!editor || disabled || !canDeleteRow}
          onClick={() => runTableCommand(() => editor!.chain().focus().deleteRow().run())}
          className={buttonClass}
          title="Remover linha"
        >
          − Linha
        </button>
        <button
          type="button"
          disabled={!editor || disabled || !canAddColumnBefore}
          onClick={() => runTableCommand(() => editor!.chain().focus().addColumnBefore().run())}
          className={buttonClass}
          title="Adicionar coluna à esquerda"
        >
          Col ←
        </button>
        <button
          type="button"
          disabled={!editor || disabled || !canAddColumnAfter}
          onClick={() => runTableCommand(() => editor!.chain().focus().addColumnAfter().run())}
          className={buttonClass}
          title="Adicionar coluna à direita"
        >
          Col →
        </button>
        <button
          type="button"
          disabled={!editor || disabled || !canDeleteColumn}
          onClick={() => runTableCommand(() => editor!.chain().focus().deleteColumn().run())}
          className={buttonClass}
          title="Remover coluna"
        >
          − Coluna
        </button>
        <button type="button" disabled={!editor || disabled} onClick={setLink} className={`${buttonClass} ${editor?.isActive("link") ? activeClass : ""}`}>
          Link
        </button>
        <button type="button" disabled={!editor || disabled} onClick={() => imageInputRef.current?.click()} className={buttonClass}>
          Imagem
        </button>
        <button type="button" disabled={!editor || disabled} onClick={() => videoInputRef.current?.click()} className={buttonClass}>
          Vídeo arquivo
        </button>
        <button type="button" disabled={!editor || disabled} onClick={addVideoUrl} className={buttonClass}>
          Vídeo URL
        </button>
        <span className="mx-0.5 h-5 w-px bg-slate-700" />
        <button type="button" disabled={!editor || disabled} title="Alinhar à esquerda" onClick={() => editor?.chain().focus().setTextAlign("left").run()} className={`${buttonClass} ${editor?.isActive({ textAlign: "left" }) ? activeClass : ""}`}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h12v1.5H2V4zm0 3h8v1.5H2V7zm0 3h12v1.5H2V10zm0 3h6v1.5H2V13z"/></svg>
        </button>
        <button type="button" disabled={!editor || disabled} title="Centralizar" onClick={() => editor?.chain().focus().setTextAlign("center").run()} className={`${buttonClass} ${editor?.isActive({ textAlign: "center" }) ? activeClass : ""}`}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h12v1.5H2V4zm2 3h8v1.5H4V7zm-2 3h12v1.5H2V10zm3 3h6v1.5H5V13z"/></svg>
        </button>
        <button type="button" disabled={!editor || disabled} title="Alinhar à direita" onClick={() => editor?.chain().focus().setTextAlign("right").run()} className={`${buttonClass} ${editor?.isActive({ textAlign: "right" }) ? activeClass : ""}`}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h12v1.5H2V4zm4 3h8v1.5H6V7zm-4 3h12v1.5H2V10zm6 3h6v1.5H8V13z"/></svg>
        </button>
        <button type="button" disabled={!editor || disabled} title="Justificar" onClick={() => editor?.chain().focus().setTextAlign("justify").run()} className={`${buttonClass} ${editor?.isActive({ textAlign: "justify" }) ? activeClass : ""}`}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h12v1.5H2V4zm0 3h12v1.5H2V7zm0 3h12v1.5H2V10zm0 3h12v1.5H2V13z"/></svg>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void handleMediaFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            void handleMediaFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {editor ? (
        <BubbleMenu
          editor={editor}
          options={{ placement: "top" }}
          shouldShow={({ editor: currentEditor, from, to }) => {
            if (disabled || !currentEditor.isEditable || from !== to) return false;
            return currentEditor.isActive("table");
          }}
        >
          <div className="flex max-w-[min(100vw-2rem,40rem)] flex-wrap items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/95 p-1 shadow-xl shadow-black/30">
            <button
              type="button"
              title="Adicionar linha acima"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().addRowBefore().run())}
              disabled={!canAddRowBefore}
              className={bubbleButtonClass}
            >
              Linha ↑
            </button>
            <button
              type="button"
              title="Adicionar linha abaixo"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().addRowAfter().run())}
              disabled={!canAddRowAfter}
              className={bubbleButtonClass}
            >
              Linha ↓
            </button>
            <button
              type="button"
              title="Remover linha"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().deleteRow().run())}
              disabled={!canDeleteRow}
              className={bubbleButtonClass}
            >
              − Linha
            </button>
            <span className="mx-0.5 h-5 w-px bg-slate-700" />
            <button
              type="button"
              title="Adicionar coluna à esquerda"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().addColumnBefore().run())}
              disabled={!canAddColumnBefore}
              className={bubbleButtonClass}
            >
              Col ←
            </button>
            <button
              type="button"
              title="Adicionar coluna à direita"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().addColumnAfter().run())}
              disabled={!canAddColumnAfter}
              className={bubbleButtonClass}
            >
              Col →
            </button>
            <button
              type="button"
              title="Remover coluna"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().deleteColumn().run())}
              disabled={!canDeleteColumn}
              className={bubbleButtonClass}
            >
              − Coluna
            </button>
            <span className="mx-0.5 h-5 w-px bg-slate-700" />
            <button
              type="button"
              title="Excluir tabela"
              onMouseDown={(event) => event.preventDefault()}
              onClick={deleteTable}
              disabled={!canDeleteTable}
              className="rounded-md px-2.5 py-1 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40"
            >
              Excluir tabela
            </button>
          </div>
        </BubbleMenu>
      ) : null}
      {editor ? (
        <BubbleMenu
          editor={editor}
          options={{ placement: "top" }}
          shouldShow={({ editor: currentEditor, from, to }: { editor: { isEditable: boolean; isActive: (name: string) => boolean }; from: number; to: number }) => {
            if (disabled || !currentEditor.isEditable || from === to) return false;
            return !currentEditor.isActive("image");
          }}
        >
          <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/95 p-1 shadow-xl shadow-black/30">
            <button type="button" title="Negrito" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} className={`${bubbleButtonClass} ${editor.isActive("bold") ? activeClass : ""}`}>
              <strong>B</strong>
            </button>
            <button type="button" title="Itálico" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} className={`${bubbleButtonClass} ${editor.isActive("italic") ? activeClass : ""}`}>
              <em>I</em>
            </button>
            <button type="button" title="Título" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`${bubbleButtonClass} ${editor.isActive("heading", { level: 2 }) ? activeClass : ""}`}>
              H
            </button>
            <button type="button" title="Lista" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()} className={`${bubbleButtonClass} ${editor.isActive("bulletList") ? activeClass : ""}`}>
              •
            </button>
            <button type="button" title="Lista numerada" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`${bubbleButtonClass} ${editor.isActive("orderedList") ? activeClass : ""}`}>
              1.
            </button>
            <button type="button" title="Destaque" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`${bubbleButtonClass} ${editor.isActive("blockquote") ? activeClass : ""}`}>
              "
            </button>
            <button type="button" title="Link" onMouseDown={(event) => event.preventDefault()} onClick={setLink} className={`${bubbleButtonClass} ${editor.isActive("link") ? activeClass : ""}`}>
              ↗
            </button>
          </div>
        </BubbleMenu>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
