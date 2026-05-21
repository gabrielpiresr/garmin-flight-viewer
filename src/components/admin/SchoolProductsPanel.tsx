import { useCallback, useEffect, useState } from "react";
import {
  createSchoolProduct,
  deleteSchoolProduct,
  listSchoolProducts,
  toggleSchoolProductActive,
  updateSchoolProduct,
} from "../../lib/schoolProductsDb";
import type { SchoolProduct } from "../../types/costs";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function parseCurrency(value: string): number {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type ProductForm = { name: string; idealPrice: string };
const emptyForm: ProductForm = { name: "", idealPrice: "" };

export function SchoolProductsPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<SchoolProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSchoolProducts(true); // include inactive for admin
      setProducts(list);
    } catch {
      showToast({ message: "Erro ao carregar produtos.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(product: SchoolProduct) {
    setForm({ name: product.name, idealPrice: String(product.idealPrice) });
    setEditingId(product.id);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast({ message: "Informe o nome do produto.", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const input = { name: form.name.trim(), idealPrice: parseCurrency(form.idealPrice) };
      if (editingId) {
        const updated = await updateSchoolProduct(editingId, input);
        setProducts((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
        showToast({ message: "Produto atualizado.", variant: "success" });
      } else {
        const created = await createSchoolProduct(input);
        setProducts((prev) => [...prev, created]);
        showToast({ message: "Produto criado.", variant: "success" });
      }
      cancelForm();
    } catch {
      showToast({ message: "Erro ao salvar produto.", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(product: SchoolProduct) {
    try {
      const updated = await toggleSchoolProductActive(product.id, !product.active);
      setProducts((prev) => prev.map((p) => (p.id === product.id ? updated : p)));
    } catch {
      showToast({ message: "Erro ao atualizar produto.", variant: "error" });
    }
  }

  async function handleDelete(product: SchoolProduct) {
    if (!confirm(`Excluir "${product.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteSchoolProduct(product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      showToast({ message: "Produto excluído.", variant: "success" });
    } catch {
      showToast({ message: "Erro ao excluir produto.", variant: "error" });
    }
  }

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Produtos e Serviços</h3>
          <p className="mt-1 text-xs text-slate-500">Cadastre produtos ou serviços para vender aos usuários.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
        >
          + Novo produto
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
          <p className="mb-3 text-xs font-semibold text-slate-300">{editingId ? "Editar produto" : "Novo produto"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Nome *
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Taxa de matrícula"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Valor ideal
              <div className="mt-1 flex rounded-lg border border-slate-700 bg-slate-800 focus-within:border-emerald-500">
                <span className="flex items-center border-r border-slate-700 px-3 text-sm text-slate-400">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.idealPrice}
                  onChange={(e) => setForm((f) => ({ ...f, idealPrice: e.target.value }))}
                  placeholder="0"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingId ? "Salvar" : "Criar"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      ) : products.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum produto cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {products.map((product) => (
            <div
              key={product.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                product.active
                  ? "border-slate-700/60 bg-slate-800/30"
                  : "border-slate-700/30 bg-slate-900/20 opacity-60"
              }`}
            >
              <div>
                <p className="text-sm font-medium text-slate-200">{product.name}</p>
                <p className="text-xs text-slate-500">{formatBRL(product.idealPrice)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(product)}
                  className="rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggle(product)}
                  className="rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
                >
                  {product.active ? "Desativar" : "Ativar"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(product)}
                  className="rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-900/30 hover:text-red-300"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
