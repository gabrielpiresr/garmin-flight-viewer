import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { usePermissions } from "../../contexts/PermissionsContext";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatExpiration(purchaseDate: string, validityDays: string): string | null {
  if (!purchaseDate || !validityDays) return null;
  const days = Math.round(Number(validityDays.replace(",", ".")));
  if (!Number.isFinite(days) || days <= 0) return null;
  const d = new Date(`${purchaseDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}
import { createAdminUserCredit, deleteAdminUserCredit, updateAdminUserCredit } from "../../lib/adminUsersDb";
import { getStudentCreditStatement } from "../../lib/creditsDb";
import { listModels } from "../../lib/aircraftModelsDb";
import type { AircraftModel } from "../../types/admin";
import type { StudentCreditInput, StudentCreditPurchase, StudentCreditStatement } from "../../types/credits";
import { CreditStatementView } from "../CreditStatementView";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

type CreditForm = {
  purchaseDate: string;
  aircraftModelId: string;
  amountPaid: string;
  paymentMethod: string;
  paymentInstallments: string;
  validityDays: string;
  hours: string;
  notes: string;
  isNight: boolean;
};

const PAYMENT_METHODS = ["Cartão de crédito à vista", "Parcelado", "PIX"] as const;

const emptyForm: CreditForm = {
  purchaseDate: new Date().toISOString().slice(0, 10),
  aircraftModelId: "",
  amountPaid: "",
  paymentMethod: "PIX",
  paymentInstallments: "",
  validityDays: "90",
  hours: "",
  notes: "",
  isNight: false,
};

function parseNumber(value: string): number {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value).replace(".", ",") : "";
}

export function AdminUserCreditsSection({ studentUserId, studentName, anacCode }: { studentUserId: string; studentName: string; anacCode?: string }) {
  const { user } = useAuth();
  const { canAction } = usePermissions();
  const { showToast } = useToast();
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [statement, setStatement] = useState<StudentCreditStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreditForm>(emptyForm);
  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoadingModels(true);
    void listModels()
      .then(setModels)
      .catch((e) => showToast({ variant: "error", message: (e as Error).message }))
      .finally(() => setLoadingModels(false));
  }, [showToast]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getStudentCreditStatement({
        viewer: { userId: user.id, role: user.role },
        studentUserId,
      });
      setStatement(next);
    } catch (e) {
      setError((e as Error).message);
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [studentUserId, user]);

  useEffect(() => {
    setForm(emptyForm);
    setEditingCreditId(null);
    void load();
  }, [load]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === form.aircraftModelId) ?? null,
    [form.aircraftModelId, models],
  );

  const valorPorHora = useMemo(() => {
    const paid = parseNumber(form.amountPaid);
    const hrs = parseNumber(form.hours);
    if (!paid || !hrs) return null;
    return paid / hrs;
  }, [form.amountPaid, form.hours]);

  const expiracaoFormatada = useMemo(
    () => formatExpiration(form.purchaseDate, form.validityDays),
    [form.purchaseDate, form.validityDays],
  );

  function toInput(): StudentCreditInput {
    return {
      userId: studentUserId,
      purchaseDate: form.purchaseDate,
      aircraftModelId: form.aircraftModelId,
      aircraftModelName: selectedModel?.name || "",
      amountPaid: parseNumber(form.amountPaid),
      paymentMethod: form.paymentMethod.trim(),
      paymentInstallments: form.paymentMethod === "Parcelado" ? Math.round(parseNumber(form.paymentInstallments)) : null,
      validityDays: Math.round(parseNumber(form.validityDays)),
      hours: parseNumber(form.hours),
      notes: form.notes,
      isNight: form.isNight,
    };
  }

  function startEdit(purchase: StudentCreditPurchase) {
    setEditingCreditId(purchase.id);
    setForm({
      purchaseDate: purchase.purchaseDate,
      aircraftModelId: purchase.aircraftModelId,
      amountPaid: formatNumber(purchase.amountPaid),
      paymentMethod: purchase.paymentMethod,
      paymentInstallments: purchase.paymentInstallments ? String(purchase.paymentInstallments) : "",
      validityDays: String(purchase.validityDays),
      hours: formatNumber(purchase.hours),
      notes: purchase.notes,
      isNight: purchase.isNight,
    });
    setModalOpen(true);
  }

  function cancelEdit() {
    setEditingCreditId(null);
    setForm(emptyForm);
    setModalOpen(false);
  }

  function openCreate() {
    setEditingCreditId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const input = toInput();
      if (editingCreditId) {
        await updateAdminUserCredit(editingCreditId, input);
        showToast({ variant: "success", message: "Crédito atualizado." });
      } else {
        await createAdminUserCredit(input);
        showToast({ variant: "success", message: "Crédito adicionado." });
      }
      cancelEdit();
      await load();
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(purchase: StudentCreditPurchase) {
    if (!window.confirm(`Remover o crédito de ${purchase.aircraftModelName}?`)) return;
    setDeletingId(purchase.id);
    try {
      await deleteAdminUserCredit(purchase.id, studentUserId);
      showToast({ variant: "success", message: "Crédito removido." });
      if (editingCreditId === purchase.id) cancelEdit();
      await load();
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setDeletingId(null);
    }
  }

  const isInstallment = form.paymentMethod === "Parcelado";

  return (
    <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Créditos</p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">Créditos de {studentName}</h3>
          <p className="text-xs text-slate-500">Compras editáveis pelo admin e saídas calculadas pelos voos executados.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAction("credit.launch") && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
            >
              Adicionar crédito
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Recarregar
          </button>
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
                  {editingCreditId ? "Editar crédito" : "Adicionar crédito"}
                </p>
                <p className="mt-1 text-sm text-slate-400">Preencha os dados da compra de horas do aluno.</p>
              </div>
              <button type="button" onClick={cancelEdit} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                Fechar
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-slate-700/60 bg-slate-800/40 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Resumo do aluno</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-slate-500">Nome</span>
                  <p className="mt-0.5 font-medium text-slate-200">{studentName}</p>
                </div>
                <div>
                  <span className="text-slate-500">Código ANAC</span>
                  <p className="mt-0.5 font-medium text-slate-200">{anacCode || "-"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Valor por hora</span>
                  <p className="mt-0.5 font-medium text-slate-200">
                    {valorPorHora != null ? formatBRL(valorPorHora) : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Expiração</span>
                  <p className="mt-0.5 font-medium text-slate-200">{expiracaoFormatada ?? "-"}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-400">
                Data
                <input type="date" value={form.purchaseDate} onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
              </label>
              <label className="text-xs text-slate-400">
                Modelo de avião
                <select value={form.aircraftModelId} onChange={(e) => setForm((prev) => ({ ...prev, aircraftModelId: e.target.value }))} disabled={loadingModels} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500">
                  <option value="">{loadingModels ? "Carregando modelos..." : "Selecione"}</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Valor pago
                <div className="mt-1 flex rounded-lg border border-slate-700 bg-slate-800 focus-within:border-cyan-500">
                  <span className="flex items-center border-r border-slate-700 px-3 text-sm text-slate-400">R$</span>
                  <input value={form.amountPaid} onChange={(e) => setForm((prev) => ({ ...prev, amountPaid: e.target.value }))} placeholder="0,00" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none" />
                </div>
              </label>
              <label className="text-xs text-slate-400">
                Pagamento
                <select
                  value={form.paymentMethod}
                  onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value, paymentInstallments: e.target.value === "Parcelado" ? prev.paymentInstallments : "" }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </label>
              {isInstallment ? (
                <label className="text-xs text-slate-400">
                  Quantidade de parcelas
                  <input value={form.paymentInstallments} onChange={(e) => setForm((prev) => ({ ...prev, paymentInstallments: e.target.value }))} placeholder="Ex: 3" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
                </label>
              ) : null}
              <label className="text-xs text-slate-400">
                Horas
                <input value={form.hours} onChange={(e) => setForm((prev) => ({ ...prev, hours: e.target.value }))} placeholder="10" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
              </label>
              <label className="text-xs text-slate-400">
                Validade (dias)
                <input value={form.validityDays} onChange={(e) => setForm((prev) => ({ ...prev, validityDays: e.target.value }))} placeholder="90" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
              </label>
              <label className="text-xs text-slate-400 md:col-span-2">
                Observação
                <input value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Opcional" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-indigo-700/40 bg-indigo-950/20 p-3 text-sm text-slate-200 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isNight}
                  onChange={(e) => setForm((prev) => ({ ...prev, isNight: e.target.checked }))}
                  className="h-4 w-4 accent-indigo-500"
                />
                Hora noturna
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={cancelEdit} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
                Cancelar
              </button>
              <button type="submit" disabled={saving || loadingModels} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50">
                {saving ? "Salvando..." : editingCreditId ? "Salvar crédito" : "Adicionar crédito"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-3 text-sm text-red-300">{error}</p>
      ) : statement ? (
        <CreditStatementView
          statement={statement}
          title="Extrato de créditos"
          description="Resumo por modelo, compras e saídas geradas por voos executados."
          renderPurchaseActions={(purchase) => (
            <>
              <button
                type="button"
                onClick={() => startEdit(purchase)}
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(purchase)}
                disabled={deletingId === purchase.id}
                className="rounded border border-red-500/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950/30 disabled:opacity-50"
              >
                {deletingId === purchase.id ? "Removendo..." : "Remover"}
              </button>
            </>
          )}
        />
      ) : null}
    </section>
  );
}
