import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { getManeuverEditorExtensions } from "../../lib/maneuverContent";
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
  const extensions = useMemo(() => getManeuverEditorExtensions(placeholder), [placeholder]);
  const editor = useEditor({
    extensions,
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getJSON() as ManeuverRichContent),
    editorProps: {
      attributes: {
        class:
          "min-h-72 rounded-b-xl border-x border-b border-slate-700 bg-slate-950/40 px-4 py-3 text-sm leading-relaxed text-slate-100 outline-none",
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
        <button type="button" disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={`${buttonClass} ${editor?.isActive("blockquote") ? activeClass : ""}`}>
          Destaque
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
