import { useEffect, useState } from "react";
import { useToast } from "../ui/ToastProvider";
import {
  listContractTemplates,
  deleteContractTemplate,
} from "../../lib/contractTemplatesDb";
import type { ContractTemplate } from "../../types/contracts";
import { ContractTemplateEditorModal } from "./ContractTemplateEditorModal";

type Props = {
  schoolId: string;
  adminUserId: string;
};

export function ContractLayoutsSection({ schoolId, adminUserId }: Props) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listContractTemplates(schoolId).then((data) => {
      if (!cancelled) {
        setTemplates(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [schoolId]);

  function openNew() {
    setEditingTemplate(null);
    setEditorOpen(true);
  }

  function openEdit(template: ContractTemplate) {
    setEditingTemplate(template);
    setEditorOpen(true);
  }

  function handleSaved(template: ContractTemplate) {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === template.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = template;
        return next;
      }
      return [template, ...prev];
    });
    setEditorOpen(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este layout de contrato? Contratos já emitidos não serão afetados.")) return;
    setDeletingId(id);
    try {
      await deleteContractTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      showToast({ variant: "success", message: "Layout excluído." });
    } catch {
      showToast({ variant: "error", message: "Erro ao excluir layout." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Layouts de Contrato</h2>
          <p className="text-xs text-slate-500">Templates com texto rico e variáveis substituíveis</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Novo Layout
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-800 bg-slate-900/40" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 py-12 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto mb-3 h-8 w-8 text-slate-600">
            <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z" />
            <path d="M5.25 5.25a3 3 0 00-3 3v10.5a3 3 0 003 3h10.5a3 3 0 003-3V13.5a.75.75 0 00-1.5 0v5.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V8.25a1.5 1.5 0 011.5-1.5h5.25a.75.75 0 000-1.5H5.25z" />
          </svg>
          <p className="text-sm text-slate-500">Nenhum layout criado ainda</p>
          <p className="mt-1 text-xs text-slate-600">Clique em "Novo Layout" para criar o primeiro template</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">{template.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {template.customVariables.length > 0
                    ? `${template.customVariables.length} variável${template.customVariables.length > 1 ? "is" : ""} personalizada${template.customVariables.length > 1 ? "s" : ""} · `
                    : ""}
                  Criado em{" "}
                  {new Date(template.createdAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(template)}
                  className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(template.id)}
                  disabled={deletingId === template.id}
                  className="rounded-lg border border-red-800/50 px-2.5 py-1.5 text-xs text-red-400 transition hover:bg-red-950/40 disabled:opacity-50"
                >
                  {deletingId === template.id ? "..." : "Excluir"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <ContractTemplateEditorModal
          schoolId={schoolId}
          adminUserId={adminUserId}
          template={editingTemplate}
          onSaved={handleSaved}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
