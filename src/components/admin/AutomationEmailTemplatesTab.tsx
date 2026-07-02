import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { generateHTML } from "@tiptap/html";
import {
  deleteAutomationEmailTemplate,
  duplicateAutomationEmailTemplate,
  listAutomationEmailTemplates,
  saveAutomationEmailTemplate,
  sendAutomationEmailTemplateTest,
} from "../../lib/studentAutomationsDb";
import {
  AUTOMATION_TEMPLATE_VARIABLES,
  type AutomationEmailTemplate,
} from "../../types/studentAutomation";
import { useToast } from "../ui/ToastProvider";
import { Skeleton } from "../ui/Skeleton";

const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Link.configure({ openOnClick: false, autolink: true }),
  Placeholder.configure({ placeholder: "Escreva o conteúdo do email..." }),
];

type Draft = {
  name: string;
  subject: string;
  bodyHtml: string;
  bodyJson: JSONContent | null;
  active: boolean;
};
const EMPTY: Draft = {
  name: "",
  subject: "",
  bodyHtml: "",
  bodyJson: null,
  active: true,
};

function RichEditor({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: draft.bodyJson || draft.bodyHtml || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-72 px-5 py-4 text-sm leading-relaxed text-slate-900 outline-none prose prose-sm max-w-none",
      },
    },
    onUpdate: ({ editor: instance }) => {
      const json = instance.getJSON();
      let html = "";
      try {
        html = generateHTML(json, EXTENSIONS);
      } catch {
        html = instance.getHTML();
      }
      onChange({ ...draft, bodyJson: json, bodyHtml: html });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const desired = draft.bodyHtml || "<p></p>";
    if (current !== desired)
      editor.commands.setContent(draft.bodyJson || draft.bodyHtml || "", {
        emitUpdate: false,
      });
  }, [draft.bodyHtml, draft.bodyJson, editor]);

  const button = (label: string, action: () => void, active = false) => (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        action();
      }}
      className={`rounded border px-2 py-1 text-xs ${active ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700">
      <div className="flex flex-wrap gap-1 border-b border-slate-700 bg-slate-900 p-2">
        {button(
          "Negrito",
          () => editor?.chain().focus().toggleBold().run(),
          Boolean(editor?.isActive("bold")),
        )}
        {button(
          "Itálico",
          () => editor?.chain().focus().toggleItalic().run(),
          Boolean(editor?.isActive("italic")),
        )}
        {button(
          "H2",
          () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
          Boolean(editor?.isActive("heading", { level: 2 })),
        )}
        {button(
          "Lista",
          () => editor?.chain().focus().toggleBulletList().run(),
          Boolean(editor?.isActive("bulletList")),
        )}
        {button("Link", () => {
          const href = window.prompt("URL do link", "https://");
          if (href) editor?.chain().focus().setLink({ href }).run();
        })}
      </div>
      <div className="bg-white">
        <EditorContent editor={editor} />
      </div>
      <div className="flex flex-wrap gap-1 border-t border-slate-700 bg-slate-950 p-2">
        {AUTOMATION_TEMPLATE_VARIABLES.map((variable) => (
          <button
            key={variable}
            type="button"
            onClick={() =>
              editor?.chain().focus().insertContent(`{{${variable}}}`).run()
            }
            className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
          >
            {variable}
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: AutomationEmailTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Draft>(() =>
    template
      ? {
          name: template.name,
          subject: template.subject,
          bodyHtml: template.bodyHtml,
          bodyJson: template.bodyJson as JSONContent | null,
          active: template.active,
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await saveAutomationEmailTemplate(draft, template?.id);
      showToast({ variant: "success", message: "Template salvo." });
      onSaved();
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Falha ao salvar template.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!template?.id || !testEmail.trim()) return;
    setTesting(true);
    try {
      await sendAutomationEmailTemplateTest(template.id, testEmail.trim());
      showToast({ variant: "success", message: "Email de teste enviado." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha no teste.",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-400">
              Template transacional
            </p>
            <h3 className="text-lg font-semibold text-white">
              {template ? "Editar template" : "Novo template"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-300"
          >
            Fechar
          </button>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <label className="block text-xs text-slate-400">
              Nome
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Assunto
              <input
                value={draft.subject}
                onChange={(e) =>
                  setDraft({ ...draft, subject: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              />
            </label>
            <RichEditor draft={draft} onChange={setDraft} />
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
                className="accent-emerald-500"
              />
              Disponível para automações
            </label>
          </div>
          <aside className="space-y-4">
            <button
              type="button"
              onClick={() => setPreview((value) => !value)}
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
            >
              {preview ? "Ocultar preview" : "Visualizar email"}
            </button>
            {preview ? (
              <div className="overflow-hidden rounded-xl border border-slate-700 bg-white">
                <div className="border-b bg-slate-100 p-3 text-sm font-semibold text-slate-900">
                  {draft.subject || "Sem assunto"}
                </div>
                <div
                  className="p-4 text-sm text-slate-800"
                  dangerouslySetInnerHTML={{ __html: draft.bodyHtml }}
                />
              </div>
            ) : null}
            {template ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm font-medium text-slate-200">
                  Envio de teste
                </p>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="mt-3 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  disabled={testing || !testEmail}
                  onClick={() => void sendTest()}
                  className="mt-2 w-full rounded bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-300 disabled:opacity-50"
                >
                  {testing ? "Enviando..." : "Enviar teste"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Salve o template antes de enviar um teste.
              </p>
            )}
          </aside>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-slate-400"
          >
            Cancelar
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar template"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AutomationEmailTemplatesTab() {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<AutomationEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<
    AutomationEmailTemplate | "new" | null
  >(null);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    try {
      setTemplates(await listAutomationEmailTemplates());
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha ao carregar templates.",
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const visible = useMemo(
    () =>
      templates.filter((template) =>
        `${template.name} ${template.subject}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, templates],
  );

  async function remove(template: AutomationEmailTemplate) {
    if (!window.confirm(`Excluir o template “${template.name}”?`)) return;
    try {
      await deleteAutomationEmailTemplate(template.id);
      await load();
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao excluir.",
      });
    }
  }

  async function duplicate(template: AutomationEmailTemplate) {
    try {
      await duplicateAutomationEmailTemplate(template.id);
      await load();
      showToast({ variant: "success", message: "Template duplicado." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao duplicar.",
      });
    }
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Conteúdo reutilizável
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Templates de email
          </h2>
          <p className="text-sm text-slate-400">
            Crie mensagens com variáveis dinâmicas e preview antes de ativar o
            fluxo.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar template"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <button
            onClick={() => setEditing("new")}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Novo template
          </button>
        </div>
      </section>
      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : visible.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((template) => (
            <article
              key={template.id}
              className="rounded-xl border border-slate-800 bg-slate-900/45 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{template.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                    {template.subject}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${template.active ? "border-emerald-500/40 text-emerald-300" : "border-slate-700 text-slate-500"}`}
                >
                  {template.active ? "ATIVO" : "INATIVO"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setEditing(template)}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                >
                  Editar
                </button>
                <button
                  onClick={() => void duplicate(template)}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                >
                  Duplicar
                </button>
                <button
                  onClick={() => void remove(template)}
                  className="rounded border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300"
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-sm text-slate-500">
          Nenhum template criado.
        </div>
      )}
      {editing ? (
        <TemplateModal
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
