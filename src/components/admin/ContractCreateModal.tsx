import { useEffect, useState } from "react";
import { useToast } from "../ui/ToastProvider";
import { listContractTemplates } from "../../lib/contractTemplatesDb";
import { createContract } from "../../lib/contractsDb";
import { listAdminUserSummaries } from "../../lib/adminUsersDb";
import { functions, ADMIN_USERS_FUNCTION_ID } from "../../lib/appwrite";
import type { ContractTemplate } from "../../types/contracts";
import type { Contract } from "../../types/contracts";
import type { AdminUserSummary } from "../../types/adminUsers";

type Props = {
  schoolId: string;
  adminUserId: string;
  onCreated: (contract: Contract) => void;
  onClose: () => void;
};

type Step = "recipient" | "template" | "variables" | "confirm";

export function ContractCreateModal({ schoolId, adminUserId, onCreated, onClose }: Props) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>("recipient");

  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);

  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);

  const [customVarValues, setCustomVarValues] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (step !== "template") return;
    setTemplatesLoading(true);
    void listContractTemplates(schoolId).then((data) => {
      setTemplates(data);
      setTemplatesLoading(false);
    });
  }, [step, schoolId]);

  useEffect(() => {
    if (step !== "template" && step !== "recipient") return;
    if (!userSearch.trim()) { setUsers([]); return; }
    setSearchLoading(true);
    const timeout = setTimeout(() => {
      void listAdminUserSummaries({ search: userSearch, limit: 10, offset: 0 }).then((page) => {
        setUsers(page.users);
        setSearchLoading(false);
      }).catch(() => setSearchLoading(false));
    }, 400);
    return () => clearTimeout(timeout);
  }, [userSearch, step]);

  function handleSelectUser(user: AdminUserSummary) {
    setSelectedUser(user);
    setStep("template");
  }

  function handleSelectTemplate(template: ContractTemplate) {
    setSelectedTemplate(template);
    const initialValues: Record<string, string> = {};
    for (const v of template.customVariables) {
      initialValues[v.name] = "";
    }
    setCustomVarValues(initialValues);
    if (template.customVariables.length > 0) {
      setStep("variables");
    } else {
      setStep("confirm");
    }
  }

  async function handleCreate() {
    if (!selectedUser || !selectedTemplate) return;
    setSaving(true);
    try {
      const contract = await createContract({
        schoolId,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        templateContentJson: selectedTemplate.contentJson,
        recipientUserId: selectedUser.userId,
        recipientName: selectedUser.profile.fullName || selectedUser.name,
        recipientEmail: selectedUser.email,
        customVarValues,
        createdBy: adminUserId,
      });

      // Send email notification via admin-users function (best-effort)
      if (functions && ADMIN_USERS_FUNCTION_ID) {
        void functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify({
          action: "sendContractEmail",
          contractId: contract.id,
          recipientEmail: selectedUser.email,
          recipientName: selectedUser.profile.fullName || selectedUser.name,
          templateName: selectedTemplate.name,
        }), true);
      }

      onCreated(contract);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message || "Erro ao criar contrato." });
    } finally {
      setSaving(false);
    }
  }

  const STEP_LABELS: Record<Step, string> = {
    recipient: "Destinatário",
    template: "Template",
    variables: "Variáveis",
    confirm: "Confirmar",
  };

  const steps: Step[] = ["recipient", "template", ...(selectedTemplate && selectedTemplate.customVariables.length > 0 ? ["variables" as Step] : []), "confirm"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-100">Novo Contrato</h2>
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

        {/* Step indicator */}
        <div className="flex gap-1 px-6 pt-4">
          {steps.map((s, idx) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${step === s ? "bg-sky-600 text-white" : steps.indexOf(step) > idx ? "bg-emerald-700/40 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
                {steps.indexOf(step) > idx ? "✓" : idx + 1}
              </div>
              <span className={`text-xs ${step === s ? "text-sky-400" : "text-slate-500"}`}>{STEP_LABELS[s]}</span>
              {idx < steps.length - 1 && <span className="mx-1 text-slate-700">›</span>}
            </div>
          ))}
        </div>

        <div className="p-6">
          {/* Step 1: Recipient */}
          {step === "recipient" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">Busque o aluno ou instrutor que receberá o contrato.</p>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar por nome, e-mail..."
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                autoFocus
              />
              {searchLoading && <p className="text-xs text-slate-500">Buscando...</p>}
              {users.length > 0 && (
                <div className="space-y-1">
                  {users.map((u) => (
                    <button
                      key={u.userId}
                      type="button"
                      onClick={() => handleSelectUser(u)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-left transition hover:border-sky-700/50 hover:bg-sky-950/20"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-200">{u.profile.fullName || u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400 capitalize">{u.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Template */}
          {step === "template" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-slate-800/60 px-3 py-1.5">
                  <p className="text-xs text-slate-400">Destinatário</p>
                  <p className="text-sm font-medium text-slate-200">{selectedUser?.profile.fullName || selectedUser?.name}</p>
                </div>
              </div>
              <p className="text-sm text-slate-400">Selecione o template de contrato.</p>
              {templatesLoading ? (
                <div className="h-20 animate-pulse rounded-lg bg-slate-800" />
              ) : templates.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum layout criado ainda. Crie um na aba Layouts.</p>
              ) : (
                <div className="space-y-1">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemplate(t)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-left transition hover:border-sky-700/50 hover:bg-sky-950/20"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-200">{t.name}</p>
                        {t.customVariables.length > 0 && (
                          <p className="text-xs text-slate-500">{t.customVariables.length} variável(is) personalizada(s)</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setStep("recipient")} className="text-xs text-slate-500 hover:text-slate-300">
                ← Voltar
              </button>
            </div>
          )}

          {/* Step 3: Variables */}
          {step === "variables" && selectedTemplate && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">Preencha os valores das variáveis personalizadas do template.</p>
              {selectedTemplate.customVariables.map((v) => (
                <label key={v.name} className="block text-xs text-slate-500">
                  {v.label}
                  <input
                    type="text"
                    value={customVarValues[v.name] ?? ""}
                    onChange={(e) => setCustomVarValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                    placeholder={`Valor para {{${v.name}}}`}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep("template")} className="text-xs text-slate-500 hover:text-slate-300">
                  ← Voltar
                </button>
                <button
                  type="button"
                  onClick={() => setStep("confirm")}
                  className="ml-auto rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
                >
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === "confirm" && selectedUser && selectedTemplate && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Destinatário</span>
                  <span className="text-slate-200 font-medium">{selectedUser.profile.fullName || selectedUser.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">E-mail</span>
                  <span className="text-slate-200">{selectedUser.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Template</span>
                  <span className="text-slate-200">{selectedTemplate.name}</span>
                </div>
                {Object.entries(customVarValues).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-slate-500">{`{{${key}}}`}</span>
                    <span className="text-slate-200">{value || "(vazio)"}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                O contrato será gerado e um e-mail de notificação será enviado ao destinatário.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(selectedTemplate.customVariables.length > 0 ? "variables" : "template")}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                >
                  {saving ? "Criando..." : "Gerar Contrato"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
