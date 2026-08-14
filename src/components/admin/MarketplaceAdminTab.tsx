import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMarketplaceCategory,
  createMarketplaceProduct,
  deleteMarketplaceCategory,
  deleteMarketplaceProduct,
  getMarketplaceSettings,
  listMarketplaceCategories,
  listMarketplaceOrders,
  listMarketplaceProducts,
  saveMarketplaceSettings,
  toggleMarketplaceProductActive,
  updateMarketplaceCategory,
  updateMarketplaceOrderNotes,
  updateMarketplaceOrderStatus,
  updateMarketplaceProduct,
  uploadMarketplaceImage,
} from "../../lib/marketplaceDb";
import type {
  MarketplaceAttribute,
  MarketplaceCategory,
  MarketplaceOrder,
  MarketplaceProduct,
  MarketplaceProductInput,
  MarketplaceSettings,
  MarketplaceVariant,
} from "../../types/marketplace";
import { defaultMarketplaceSettings } from "../../types/marketplace";
import { MarketplaceStorefront } from "../marketplace/MarketplaceStorefront";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/ToastProvider";

type SubTab = "catalog" | "sales" | "settings" | "preview";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type ProductFormState = {
  categoryId: string;
  name: string;
  shortDescription: string;
  description: string;
  kind: MarketplaceProductInput["kind"];
  paymentMode: MarketplaceProductInput["paymentMode"];
  price: string;
  paymentUrl: string;
  frcDiscountPercent: string;
  frcPaymentUrl: string;
  trackStock: boolean;
  stock: string;
  variants: MarketplaceVariant[];
  attributes: MarketplaceAttribute[];
  images: string[];
  featured: boolean;
  active: boolean;
  sortOrder: string;
};

const emptyForm = (): ProductFormState => ({
  categoryId: "",
  name: "",
  shortDescription: "",
  description: "",
  kind: "physical",
  paymentMode: "cakto",
  price: "",
  paymentUrl: "",
  frcDiscountPercent: "0",
  frcPaymentUrl: "",
  trackStock: false,
  stock: "",
  variants: [],
  attributes: [],
  images: [],
  featured: false,
  active: true,
  sortOrder: "0",
});

function formFromProduct(product: MarketplaceProduct): ProductFormState {
  return {
    categoryId: product.categoryId,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    kind: product.kind,
    paymentMode: product.paymentMode,
    price: String(product.price),
    paymentUrl: product.paymentUrl,
    frcDiscountPercent: String(product.frcDiscountPercent || 0),
    frcPaymentUrl: product.frcPaymentUrl,
    trackStock: product.trackStock,
    stock: product.stock == null ? "" : String(product.stock),
    variants: product.variants,
    attributes: product.attributes,
    images: product.images,
    featured: product.featured,
    active: product.active,
    sortOrder: String(product.sortOrder || 0),
  };
}

function toInput(form: ProductFormState): MarketplaceProductInput {
  return {
    categoryId: form.categoryId,
    name: form.name,
    shortDescription: form.shortDescription,
    description: form.description,
    kind: form.kind,
    paymentMode: form.paymentMode,
    price: Number(form.price.replace(",", ".")) || 0,
    paymentUrl: form.paymentUrl,
    frcDiscountPercent: Number(form.frcDiscountPercent.replace(",", ".")) || 0,
    frcPaymentUrl: form.frcPaymentUrl,
    trackStock: form.trackStock && form.paymentMode === "cakto",
    stock: form.stock.trim() === "" ? null : Math.max(0, Math.round(Number(form.stock) || 0)),
    variants: form.variants,
    attributes: form.attributes,
    images: form.images,
    featured: form.featured,
    active: form.active,
    sortOrder: Math.round(Number(form.sortOrder) || 0),
  };
}

export function MarketplaceAdminTab() {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<SubTab>("catalog");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [settings, setSettings] = useState<MarketplaceSettings>(defaultMarketplaceSettings());
  const [categoryName, setCategoryName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductFormState>(emptyForm());
  const [orderNotesDraft, setOrderNotesDraft] = useState<Record<string, string>>({});
  const [salesFilter, setSalesFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, prods, ords, cfg] = await Promise.all([
        listMarketplaceCategories(true),
        listMarketplaceProducts({ includeInactive: true }),
        listMarketplaceOrders({ limit: 300 }),
        getMarketplaceSettings(),
      ]);
      setCategories(cats);
      setProducts(prods);
      setOrders(ords);
      setSettings(cfg);
      setOrderNotesDraft(Object.fromEntries(ords.map((o) => [o.id, o.adminNotes])));
    } catch (error) {
      showToast({ message: "Erro ao carregar marketplace.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const filteredOrders = useMemo(() => {
    if (salesFilter === "all") return orders;
    return orders.filter((o) => o.status === salesFilter);
  }, [orders, salesFilter]);

  async function handleCreateCategory() {
    if (!categoryName.trim()) return;
    try {
      const created = await createMarketplaceCategory({ name: categoryName.trim() });
      setCategories((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setCategoryName("");
      showToast({ message: "Categoria criada.", variant: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "Erro ao criar categoria.",
        variant: "error",
      });
    }
  }

  async function handleSaveProduct() {
    const input = toInput(form);
    if (!input.name.trim()) {
      showToast({ message: "Informe o nome.", variant: "error" });
      return;
    }
    if (!input.categoryId) {
      showToast({ message: "Selecione a categoria.", variant: "error" });
      return;
    }
    if (input.paymentMode !== "cakto" && !input.paymentUrl.trim()) {
      showToast({ message: "Informe o link de pagamento.", variant: "error" });
      return;
    }
    if (!(input.price > 0) && input.paymentMode === "cakto") {
      showToast({ message: "Informe o preço para gerar o pagamento na Cakto.", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateMarketplaceProduct(editingId, input);
        setProducts((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
        showToast({ message: "Produto atualizado.", variant: "success" });
      } else {
        const created = await createMarketplaceProduct(input);
        setProducts((prev) => [created, ...prev]);
        showToast({ message: "Produto criado.", variant: "success" });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "Erro ao salvar produto.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadImage(file: File | null) {
    if (!file) return;
    try {
      const url = await uploadMarketplaceImage(file);
      setForm((f) => ({ ...f, images: [...f.images, url].slice(0, 8) }));
    } catch {
      showToast({ message: "Falha no upload da imagem.", variant: "error" });
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    try {
      const saved = await saveMarketplaceSettings({
        enabled: settings.enabled,
        storeTitle: settings.storeTitle,
        storeSubtitle: settings.storeSubtitle,
      });
      setSettings(saved);
      showToast({ message: "Configurações salvas.", variant: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "Erro ao salvar configurações.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Marketplace</h2>
        <p className="text-sm text-slate-400">Catálogo, vendas Cakto, configurações e preview da loja.</p>
      </div>

      <Tabs
        items={[
          { id: "catalog", label: "Catálogo" },
          { id: "sales", label: "Vendas" },
          { id: "settings", label: "Configurações" },
          { id: "preview", label: "Preview" },
        ]}
        value={subTab}
        onChange={(id) => setSubTab(id as SubTab)}
        ariaLabel="Subabas do marketplace"
        accent="sky"
      />

      {subTab === "catalog" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <h3 className="text-sm font-semibold text-slate-200">Categorias</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Nova categoria"
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => void handleCreateCategory()}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Adicionar
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((c) => (
                <div key={c.id} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/50 px-2 py-1 text-xs text-slate-300">
                  <span>{c.name}{c.active ? "" : " (off)"}</span>
                  <button
                    type="button"
                    className="text-slate-500 hover:text-emerald-400"
                    onClick={() => void updateMarketplaceCategory(c.id, { name: c.name, sortOrder: c.sortOrder, active: !c.active }).then((u) => {
                      setCategories((prev) => prev.map((x) => (x.id === c.id ? u : x)));
                    })}
                  >
                    {c.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    className="text-rose-400"
                    onClick={() => {
                      if (!confirm(`Excluir categoria "${c.name}"?`)) return;
                      void deleteMarketplaceCategory(c.id).then(() => {
                        setCategories((prev) => prev.filter((x) => x.id !== c.id));
                      });
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-200">Produtos e serviços</h3>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm({ ...emptyForm(), categoryId: categories.find((c) => c.active)?.id || "" });
                  setShowForm(true);
                }}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                + Novo item
              </button>
            </div>

            {showForm ? (
              <div className="mb-4 space-y-3 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-slate-400">
                    Nome *
                    <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Categoria *
                    <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                      <option value="">Selecione</option>
                      {categories.filter((c) => c.active || c.id === form.categoryId).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-slate-400">
                    Tipo
                    <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ProductFormState["kind"] }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                      <option value="physical">Produto físico</option>
                      <option value="service">Serviço</option>
                      <option value="digital">Digital</option>
                    </select>
                  </label>
                  <label className="block text-xs text-slate-400">
                    Pagamento
                    <select value={form.paymentMode} onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value as ProductFormState["paymentMode"] }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                      <option value="cakto">Cakto (link gerado na compra)</option>
                      <option value="external">Link externo (sem pedido)</option>
                    </select>
                  </label>
                  <label className="block text-xs text-slate-400">
                    Preço (R$)
                    <input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Ordem
                    <input value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                  </label>
                  {form.paymentMode === "external" ? (
                    <label className="block text-xs text-slate-400 sm:col-span-2">
                      Link de pagamento *
                      <input value={form.paymentUrl} onChange={(e) => setForm((f) => ({ ...f, paymentUrl: e.target.value }))} placeholder="https://..." className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                    </label>
                  ) : (
                    <p className="sm:col-span-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200/90">
                      O link da Cakto é criado automaticamente na compra, com o preço e o desconto FRC aplicados.
                    </p>
                  )}
                  <label className="block text-xs text-slate-400">
                    Desconto FRC (%)
                    <input value={form.frcDiscountPercent} onChange={(e) => setForm((f) => ({ ...f, frcDiscountPercent: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                  </label>
                  {form.paymentMode === "external" ? (
                    <label className="block text-xs text-slate-400">
                      Link pagamento FRC
                      <input value={form.frcPaymentUrl} onChange={(e) => setForm((f) => ({ ...f, frcPaymentUrl: e.target.value }))} placeholder="Opcional — se vazio, usa o link padrão" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                    </label>
                  ) : (
                    <p className="text-xs text-slate-500">Membros FRC pagam o preço com este desconto, no mesmo checkout automático.</p>
                  )}
                  <label className="block text-xs text-slate-400 sm:col-span-2">
                    Resumo curto
                    <input value={form.shortDescription} onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                  </label>
                  <label className="block text-xs text-slate-400 sm:col-span-2">
                    Detalhes
                    <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                  </label>
                </div>

                {form.paymentMode === "cakto" ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" checked={form.trackStock} onChange={(e) => setForm((f) => ({ ...f, trackStock: e.target.checked }))} />
                      Controlar estoque (só Cakto; decrementa no webhook)
                    </label>
                    {form.trackStock && form.variants.length === 0 ? (
                      <label className="mt-2 block text-xs text-slate-400">
                        Estoque
                        <input value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} className="mt-1 w-40 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                      </label>
                    ) : null}
                  </div>
                ) : null}

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variantes (ex.: tamanho)</p>
                    <button
                      type="button"
                      className="text-xs text-emerald-400"
                      onClick={() => setForm((f) => ({
                        ...f,
                        variants: [...f.variants, { id: crypto.randomUUID(), label: "", stock: null }],
                      }))}
                    >
                      + Variante
                    </button>
                  </div>
                  <div className="space-y-2">
                    {form.variants.map((v, idx) => (
                      <div key={v.id} className="flex flex-wrap gap-2">
                        <input
                          value={v.label}
                          placeholder="Ex: M"
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            variants: f.variants.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                          }))}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        />
                        {form.trackStock && form.paymentMode === "cakto" ? (
                          <input
                            value={v.stock == null ? "" : String(v.stock)}
                            placeholder="Estoque"
                            onChange={(e) => setForm((f) => ({
                              ...f,
                              variants: f.variants.map((x, i) => (
                                i === idx
                                  ? { ...x, stock: e.target.value.trim() === "" ? null : Math.max(0, Math.round(Number(e.target.value) || 0)) }
                                  : x
                              )),
                            }))}
                            className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                          />
                        ) : null}
                        <button
                          type="button"
                          className="text-xs text-rose-400"
                          onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }))}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Atributos livres</p>
                    <button
                      type="button"
                      className="text-xs text-emerald-400"
                      onClick={() => setForm((f) => ({ ...f, attributes: [...f.attributes, { key: "", value: "" }] }))}
                    >
                      + Atributo
                    </button>
                  </div>
                  <div className="space-y-2">
                    {form.attributes.map((a, idx) => (
                      <div key={idx} className="flex flex-wrap gap-2">
                        <input
                          value={a.key}
                          placeholder="Ex: Material"
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            attributes: f.attributes.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)),
                          }))}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        />
                        <input
                          value={a.value}
                          placeholder="Ex: Algodão"
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            attributes: f.attributes.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)),
                          }))}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        />
                        <button
                          type="button"
                          className="text-xs text-rose-400"
                          onClick={() => setForm((f) => ({ ...f, attributes: f.attributes.filter((_, i) => i !== idx) }))}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Imagens</p>
                  <div className="flex flex-wrap gap-2">
                    {form.images.map((url) => (
                      <div key={url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-700">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          className="absolute right-0 top-0 bg-black/70 px-1 text-[10px] text-white"
                          onClick={() => setForm((f) => ({ ...f, images: f.images.filter((u) => u !== url) }))}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-600 text-xs text-slate-400">
                      +
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleUploadImage(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} />
                    Destaque
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                    Ativo
                  </label>
                </div>

                <div className="flex gap-2">
                  <button type="button" disabled={saving} onClick={() => void handleSaveProduct()} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setForm(emptyForm());
                    }}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              {products.map((product) => (
                <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{product.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {categoryMap[product.categoryId] || "—"} · {product.paymentMode} · {formatBRL(product.price)}
                      {product.trackStock ? ` · estoque ${product.variants.length ? "por variante" : (product.stock ?? "∞")}` : ""}
                      {!product.active ? " · inativo" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs text-emerald-400"
                      onClick={() => {
                        setEditingId(product.id);
                        setForm(formFromProduct(product));
                        setShowForm(true);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-xs text-slate-400"
                      onClick={() => void toggleMarketplaceProductActive(product.id, !product.active).then((u) => {
                        setProducts((prev) => prev.map((p) => (p.id === product.id ? u : p)));
                      })}
                    >
                      {product.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-rose-400"
                      onClick={() => {
                        if (!confirm(`Excluir "${product.name}"?`)) return;
                        void deleteMarketplaceProduct(product.id).then(() => {
                          setProducts((prev) => prev.filter((p) => p.id !== product.id));
                        });
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {products.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum produto cadastrado.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {subTab === "sales" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagos</option>
              <option value="cancelled">Cancelados</option>
              <option value="refunded">Reembolsados</option>
            </select>
            <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">
              Atualizar
            </button>
          </div>
          {filteredOrders.length === 0 ? (
            <p className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-6 text-sm text-slate-400">
              Nenhuma venda Cakto registrada ainda.
            </p>
          ) : (
            filteredOrders.map((order) => (
              <div key={order.id} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-100">{order.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {order.buyerName || order.buyerEmail} · {order.variantLabel ? `${order.variantLabel} · ` : ""}
                      {new Date(order.createdAt).toLocaleString("pt-BR")}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{formatBRL(order.amount)} · {order.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {order.status === "pending" ? (
                      <button
                        type="button"
                        className="rounded-lg border border-emerald-600/40 px-2 py-1 text-[11px] text-emerald-300"
                        onClick={() => void updateMarketplaceOrderStatus(order.id, "paid").then((u) => {
                          setOrders((prev) => prev.map((o) => (o.id === order.id ? u : o)));
                        })}
                      >
                        Marcar pago
                      </button>
                    ) : null}
                    {order.status !== "cancelled" ? (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-400"
                        onClick={() => void updateMarketplaceOrderStatus(order.id, "cancelled").then((u) => {
                          setOrders((prev) => prev.map((o) => (o.id === order.id ? u : o)));
                        })}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </div>
                <label className="mt-3 block text-xs text-slate-400">
                  Observações
                  <textarea
                    value={orderNotesDraft[order.id] ?? ""}
                    onChange={(e) => setOrderNotesDraft((d) => ({ ...d, [order.id]: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-emerald-400"
                  onClick={() => void updateMarketplaceOrderNotes(order.id, orderNotesDraft[order.id] || "").then((u) => {
                    setOrders((prev) => prev.map((o) => (o.id === order.id ? u : o)));
                    showToast({ message: "Observação salva.", variant: "success" });
                  })}
                >
                  Salvar observação
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {subTab === "settings" ? (
        <section className="max-w-xl space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
            />
            Marketplace habilitado
          </label>
          <label className="block text-xs text-slate-400">
            Título da loja
            <input
              value={settings.storeTitle}
              onChange={(e) => setSettings((s) => ({ ...s, storeTitle: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Subtítulo
            <input
              value={settings.storeSubtitle}
              onChange={(e) => setSettings((s) => ({ ...s, storeSubtitle: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveSettings()}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </section>
      ) : null}

      {subTab === "preview" ? (
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3 sm:p-4">
          <MarketplaceStorefront mode="preview" showOrders={false} />
        </div>
      ) : null}
    </div>
  );
}
