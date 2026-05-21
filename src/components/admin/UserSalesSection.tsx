import { useCallback, useEffect, useState } from "react";
import { createProductSale, deleteProductSale, listProductSalesForUser } from "../../lib/productSalesDb";
import { listSchoolProducts } from "../../lib/schoolProductsDb";
import type { ProductSale, SchoolProduct } from "../../types/costs";
import { STUDENT_PAYMENT_METHODS } from "../../types/costs";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { useAuth } from "../../contexts/AuthContext";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string): string {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function parseCurrency(value: string): number {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type SaleForm = {
  productId: string;
  productName: string;
  idealPrice: string;
  saleDate: string;
  amountPaid: string;
  paymentMethod: string;
  notes: string;
};

const emptyForm: SaleForm = {
  productId: "",
  productName: "",
  idealPrice: "",
  saleDate: todayIso(),
  amountPaid: "",
  paymentMethod: "PIX",
  notes: "",
};

export function UserSalesSection({ userId }: { userId: string }) {
  const { user: authUser } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sales, setSales] = useState<ProductSale[]>([]);
  const [products, setProducts] = useState<SchoolProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SaleForm>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [salesList, productsList] = await Promise.all([
        listProductSalesForUser(userId),
        listSchoolProducts(false), // only active products
      ]);
      setSales(salesList);
      setProducts(productsList);
    } catch {
      showToast({ message: "Erro ao carregar vendas.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [userId, showToast]);

  useEffect(() => { void load(); }, [load]);

  function openForm() {
    const firstProduct = products[0];
    setForm({
      ...emptyForm,
      saleDate: todayIso(),
      productId: firstProduct?.id ?? "",
      productName: firstProduct?.name ?? "",
      idealPrice: firstProduct ? String(firstProduct.idealPrice) : "",
      amountPaid: firstProduct ? String(firstProduct.idealPrice) : "",
    });
    setShowForm(true);
  }

  function handleProductChange(productId: string) {
    const product = products.find((p) => p.id === productId);
    setForm((f) => ({
      ...f,
      productId,
      productName: product?.name ?? "",
      idealPrice: product ? String(product.idealPrice) : "",
      amountPaid: product ? String(product.idealPrice) : f.amountPaid,
    }));
  }

  async function handleSave() {
    if (!authUser) return;
    if (!form.productId) {
      showToast({ message: "Selecione um produto.", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const created = await createProductSale(
        {
          userId,
          productId: form.productId,
          productName: form.productName,
          idealPrice: parseCurrency(form.idealPrice),
          saleDate: form.saleDate,
          amountPaid: parseCurrency(form.amountPaid),
          paymentMethod: form.paymentMethod,
          notes: form.notes,
        },
        authUser.id,
      );
      setSales((prev) => [created, ...prev]);
      setShowForm(false);
      setForm(emptyForm);
      showToast({ message: "Venda registrada.", variant: "success" });
    } catch {
      showToast({ message: "Erro ao registrar venda.", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sale: ProductSale) {
    if (!confirm(`Excluir venda de "${sale.productName}"?`)) return;
    try {
      await deleteProductSale(sale.id);
      setSales((prev) => prev.filter((s) => s.id !== sale.id));
      showToast({ message: "Venda excluída.", variant: "success" });
    } catch {
      showToast({ message: "Erro ao excluir venda.", variant: "error" });
    }
  }

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vendas</p>
          <p className="mt-0.5 text-xs text-slate-600">Produtos e serviços vendidos a este usuário.</p>
        </div>
        <button
          type="button"
          onClick={openForm}
          disabled={products.length === 0}
          title={products.length === 0 ? "Cadastre produtos em Configurações > Financeiro" : undefined}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Nova venda
        </button>
      </div>

      {products.length === 0 && !loading && (
        <p className="mb-3 text-xs text-amber-400">
          Nenhum produto ativo. Cadastre em Configurações → Financeiro → Produtos e Serviços.
        </p>
      )}

      {showForm && (
        <div className="mb-4 rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
          <p className="mb-3 text-xs font-semibold text-slate-300">Registrar venda</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Produto *
              <select
                value={form.productId}
                onChange={(e) => handleProductChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              >
                <option value="">Selecione...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatBRL(p.idealPrice)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-slate-400">
              Data *
              <input
                type="date"
                value={form.saleDate}
                onChange={(e) => setForm((f) => ({ ...f, saleDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>

            <label className="block text-xs text-slate-400">
              Valor pago *
              <div className="mt-1 flex rounded-lg border border-slate-700 bg-slate-800 focus-within:border-emerald-500">
                <span className="flex items-center border-r border-slate-700 px-3 text-sm text-slate-400">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amountPaid}
                  onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
                  placeholder={form.idealPrice || "0"}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
              {form.idealPrice && form.amountPaid !== form.idealPrice && (
                <span className="mt-0.5 block text-[11px] text-slate-500">Valor ideal: {formatBRL(parseCurrency(form.idealPrice))}</span>
              )}
            </label>

            <label className="block text-xs text-slate-400">
              Forma de pagamento *
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              >
                {STUDENT_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-slate-400 sm:col-span-2">
              Observação
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Opcional"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Registrar"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
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
      ) : sales.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma venda registrada.</p>
      ) : (
        <div className="space-y-2">
          {sales.map((sale) => (
            <div key={sale.id} className="flex items-start justify-between rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium text-slate-200">{sale.productName}</p>
                  <span className="text-xs text-slate-500">{formatDate(sale.saleDate)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                  <span className="font-semibold text-emerald-400">{formatBRL(sale.amountPaid)}</span>
                  <span>·</span>
                  <span>{sale.paymentMethod}</span>
                  {sale.notes ? (
                    <>
                      <span>·</span>
                      <span className="text-slate-500">{sale.notes}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(sale)}
                className="ml-2 shrink-0 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-900/30 hover:text-red-300"
              >
                Excluir
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
