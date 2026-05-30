import { useState } from "react";
import { useToast } from "../ui/ToastProvider";
import { createContractTemplate, updateContractTemplate } from "../../lib/contractTemplatesDb";
import { uploadManeuverMedia } from "../../lib/maneuversDb";
import type { ContractTemplate, CustomVariable } from "../../types/contracts";
import { SYSTEM_VARIABLES } from "../../types/contracts";
import type { ManeuverRichContent } from "../../types/maneuver";
import { ManeuverRichTextEditor } from "./ManeuverRichTextEditor";

type Props = {
  schoolId: string;
  adminUserId: string;
  template: ContractTemplate | null;
  onSaved: (template: ContractTemplate) => void;
  onClose: () => void;
};

const EMPTY_CONTENT: ManeuverRichContent = { type: "doc", content: [] };

export function ContractTemplateEditorModal({ schoolId, adminUserId, template, onSaved, onClose }: Props) {
  const { showToast } = useToast();
  const [name, setName] = useState(template?.name ?? "");
  const [content, setContent] = useState<ManeuverRichContent>(() => {
    if (!template?.contentJson) return EMPTY_CONTENT;
    try { return JSON.parse(template.contentJson) as ManeuverRichContent; }
    catch { return EMPTY_CONTENT; }
  });
  const [customVars, setCustomVars] = useState<CustomVariable[]>(template?.customVariables ?? []);
  const [newVarName, setNewVarName] = useState("");
  const [newVarLabel, setNewVarLabel] = useState("");
  const [saving, setSaving] = useState(false);
  async function handleUploadMedia(file: File) {
    const result = await uploadManeuverMedia(file);
    return result.data;
  }

  async function handleSave() {
    if (!name.trim()) {
      showToast({ variant: "warning", message: "Informe um nome para o layout." });
      return;
    }
    setSaving(true);
    try {
      const contentJson = JSON.stringify(content);
      let saved: ContractTemplate;
      if (template) {
        saved = await updateContractTemplate(template.id, { name: name.trim(), contentJson, customVariables: customVars });
      } else {
        saved = await createContractTemplate({
          schoolId,
          name: name.trim(),
          contentJson,
          customVariables: customVars,
          createdBy: adminUserId,
        });
      }
      showToast({ variant: "success", message: "Layout salvo." });
      onSaved(saved);
    } catch {
      showToast({ variant: "error", message: "Erro ao salvar layout." });
    } finally {
      setSaving(false);
    }
  }

  function addCustomVar() {
    const trimName = newVarName.trim().replace(/\s+/g, "_").toLowerCase();
    const trimLabel = newVarLabel.trim();
    if (!trimName || !trimLabel) {
      showToast({ variant: "warning", message: "Informe o nome e o rótulo da variável." });
      return;
    }
    if (customVars.some((v) => v.name === trimName)) {
      showToast({ variant: "warning", message: "Já existe uma variável com esse nome." });
      return;
    }
    setCustomVars((prev) => [...prev, { name: trimName, label: trimLabel }]);
    setNewVarName("");
    setNewVarLabel("");
  }

  function removeCustomVar(name: string) {
    setCustomVars((prev) => prev.filter((v) => v.name !== name));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="my-4 w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-100">
            {template ? "Editar Layout" : "Novo Layout de Contrato"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex gap-0 lg:flex-row flex-col">
          {/* Main editor area */}
          <div className="flex-1 min-w-0 p-6 space-y-4">
            <label className="block text-xs text-slate-500">
              Nome do Layout
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Contrato de Matrícula"
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
              />
            </label>

            <div>
              <p className="mb-1.5 text-xs text-slate-500">Conteúdo do Contrato</p>
              <ManeuverRichTextEditor
                value={content}
                onChange={setContent}
                onUploadMedia={handleUploadMedia}
              />
            </div>
          </div>

          {/* Variables sidebar */}
          <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-slate-800 p-5 space-y-5 flex-shrink-0">
            {/* System variables */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Variáveis do Sistema
              </p>
              <p className="mb-3 text-xs text-slate-600">
                Clique para copiar e cole no editor onde desejar inserir a variável.
              </p>
              <div className="space-y-1">
                {SYSTEM_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(v.key).then(() => {
                        showToast({ variant: "success", message: `"${v.key}" copiado! Cole no editor.` });
                      });
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-800 px-2.5 py-1.5 text-left text-xs transition hover:border-sky-700/50 hover:bg-sky-950/20"
                  >
                    <span className="text-slate-300">{v.label}</span>
                    <span className="ml-2 flex-shrink-0 font-mono text-sky-400">{v.key}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom variables */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Variáveis Personalizadas
              </p>
              {customVars.length > 0 ? (
                <div className="mb-3 space-y-1">
                  {customVars.map((v) => (
                    <div key={v.name} className="flex items-center justify-between rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs">
                      <div>
                        <p className="text-slate-300">{v.label}</p>
                        <p className="font-mono text-sky-400">{`{{${v.name}}}`}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(`{{${v.name}}}`).then(() => {
                            showToast({ variant: "success", message: `"{{${v.name}}}" copiado!` });
                          });
                        }}
                        className="ml-2 shrink-0 rounded p-1 text-slate-500 hover:text-slate-300"
                        title="Copiar"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M5.5 3.5A1.5 1.5 0 017 2h2.879a1.5 1.5 0 011.06.44l2.122 2.12A1.5 1.5 0 0113.5 5.622V12.5a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 015.5 12.5v-9z" />
                          <path d="M2 7a1.5 1.5 0 011.5-1.5h1V12a2 2 0 002 2H10v1a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 012 15V7z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCustomVar(v.name)}
                        className="ml-1 shrink-0 rounded p-1 text-red-500/60 hover:text-red-400"
                        title="Remover"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-3 text-xs text-slate-600">Nenhuma variável personalizada</p>
              )}
              <div className="space-y-2">
                <input
                  type="text"
                  value={newVarLabel}
                  onChange={(e) => setNewVarLabel(e.target.value)}
                  placeholder="Rótulo (ex.: Valor da Mensalidade)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value)}
                  placeholder="Chave (ex.: valor_mensalidade)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addCustomVar}
                  className="w-full rounded-lg border border-sky-700/40 py-1.5 text-xs text-sky-400 transition hover:bg-sky-950/30"
                >
                  + Adicionar variável
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar Layout"}
          </button>
        </div>
      </div>
    </div>
  );
}
