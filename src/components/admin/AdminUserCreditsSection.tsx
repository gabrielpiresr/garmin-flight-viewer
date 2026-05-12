import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { createStudentCredit, deleteStudentCredit, getStudentCreditStatement, updateStudentCredit } from "../../lib/creditsDb";
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
  validityDays: string;
  hours: string;
  notes: string;
};

const emptyForm: CreditForm = {
  purchaseDate: new Date().toISOString().slice(0, 10),
  aircraftModelId: "",
  amountPaid: "",
  paymentMethod: "PIX",
  validityDays: "90",
  hours: "",
  notes: "",
};

function parseNumber(value: string): number {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value).replace(".", ",") : "";
}

export function AdminUserCreditsSection({ studentUserId, studentName }: { studentUserId: string; studentName: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [statement, setStatement] = useState<StudentCreditStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreditForm>(emptyForm);
  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
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

  function toInput(): StudentCreditInput {
    return {
      userId: studentUserId,
      purchaseDate: form.purchaseDate,
      aircraftModelId: form.aircraftModelId,
      aircraftModelName: selectedModel?.name || "",
      amountPaid: parseNumber(form.amountPaid),
      paymentMethod: form.paymentMethod.trim(),
      validityDays: Math.round(parseNumber(form.validityDays)),
      hours: parseNumber(form.hours),
      notes: form.notes,
    };
  }

  function startEdit(purchase: StudentCreditPurchase) {
    setEditingCreditId(purchase.id);
    setForm({
      purchaseDate: purchase.purchaseDate,
      aircraftModelId: purchase.aircraftModelId,
      amountPaid: formatNumber(purchase.amountPaid),
      paymentMethod: purchase.paymentMethod,
      validityDays: String(purchase.validityDays),
      hours: formatNumber(purchase.hours),
      notes: purchase.notes,
    });
  }

  function cancelEdit() {
    setEditingCreditId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const input = toInput();
      if (editingCreditId) {
        await updateStudentCredit(editingCreditId, input, user.id);
        showToast({ variant: "success", message: "Crédito atualizado." });
      } else {
        await createStudentCredit(input, user.id);
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
      await deleteStudentCredit(purchase.id);
      showToast({ variant: "success", message: "Crédito removido." });
      if (editingCreditId === purchase.id) cancelEdit();
      await load();
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Créditos</p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">Créditos de {studentName}</h3>
          <p className="text-xs text-slate-500">Compras editáveis pelo admin e saídas calculadas pelos voos executados.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          Recarregar créditos
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-200">{editingCreditId ? "Editar crédito" : "Adicionar crédito"}</p>
          {editingCreditId ? (
            <button type="button" onClick={cancelEdit} className="text-xs text-slate-400 underline-offset-4 hover:underline">
              Cancelar edição
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="text-xs text-slate-400">
            Data
            <input
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="text-xs text-slate-400 xl:col-span-2">
            Modelo de avião
            <select
              value={form.aircraftModelId}
              onChange={(e) => setForm((prev) => ({ ...prev, aircraftModelId: e.target.value }))}
              disabled={loadingModels}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            >
              <option value="">{loadingModels ? "Carregando modelos..." : "Selecione"}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Valor pago
            <input
              value={form.amountPaid}
              onChange={(e) => setForm((prev) => ({ ...prev, amountPaid: e.target.value }))}
              placeholder="0,00"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="text-xs text-slate-400">
            Pagamento
            <input
              value={form.paymentMethod}
              onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
              placeholder="PIX, cartão..."
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="text-xs text-slate-400">
            Horas
            <input
              value={form.hours}
              onChange={(e) => setForm((prev) => ({ ...prev, hours: e.target.value }))}
              placeholder="10"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="text-xs text-slate-400">
            Validade (dias)
            <input
              value={form.validityDays}
              onChange={(e) => setForm((prev) => ({ ...prev, validityDays: e.target.value }))}
              placeholder="90"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="text-xs text-slate-400 md:col-span-2 xl:col-span-4">
            Observação
            <input
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Opcional"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || loadingModels}
              className="w-full rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingCreditId ? "Salvar crédito" : "Adicionar"}
            </button>
          </div>
        </div>
      </form>

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
