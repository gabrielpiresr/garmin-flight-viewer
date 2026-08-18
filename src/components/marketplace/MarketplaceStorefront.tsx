import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  createMarketplaceCheckout,
  getMarketplaceSettings,
  listMarketplaceCategories,
  listMarketplaceOrders,
  listMarketplaceProducts,
} from "../../lib/marketplaceDb";
import type { MarketplaceCategory, MarketplaceOrder, MarketplaceProduct, MarketplaceSettings } from "../../types/marketplace";
import {
  defaultMarketplaceSettings,
  marketplaceEffectivePrice,
  marketplaceIsOutOfStock,
  marketplacePaymentUrlForBuyer,
} from "../../types/marketplace";
import { useFlightReviewClub } from "../../contexts/FlightReviewClubContext";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function kindLabel(kind: MarketplaceProduct["kind"]): string {
  if (kind === "service") return "Serviço";
  if (kind === "digital") return "Digital";
  return "Produto";
}

function ProductImageCarousel({
  images,
  alt,
  aspectClass = "aspect-[16/10]",
  roundedClass = "",
  large = false,
}: {
  images: string[];
  alt: string;
  aspectClass?: string;
  roundedClass?: string;
  large?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const count = images.length;

  useEffect(() => {
    setIndex(0);
    scrollerRef.current?.scrollTo({ left: 0 });
  }, [images]);

  function scrollToIndex(next: number) {
    if (count <= 0) return;
    const clamped = ((next % count) + count) % count;
    setIndex(clamped);
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  }

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== index && next >= 0 && next < count) setIndex(next);
  }

  if (count === 0) {
    return (
      <div className={`flex ${aspectClass} items-center justify-center bg-slate-800 text-[11px] text-slate-500 ${roundedClass}`}>
        Sem imagem
      </div>
    );
  }

  return (
    <div className={`relative ${aspectClass} overflow-hidden bg-slate-800 ${roundedClass}`}>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <img
            key={`${src}-${i}`}
            src={src}
            alt={i === 0 ? alt : ""}
            draggable={false}
            className="h-full w-full min-w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            className={`absolute left-1.5 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 ${large ? "h-8 w-8 text-lg" : "h-6 w-6 text-sm"}`}
            onClick={(e) => {
              e.stopPropagation();
              scrollToIndex(index - 1);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            className={`absolute right-1.5 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 ${large ? "h-8 w-8 text-lg" : "h-6 w-6 text-sm"}`}
            onClick={(e) => {
              e.stopPropagation();
              scrollToIndex(index + 1);
            }}
          >
            ›
          </button>
          <div className="pointer-events-none absolute bottom-1.5 left-0 right-0 flex justify-center gap-1">
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full ${i === index ? "w-3 bg-white" : "w-1.5 bg-white/45"}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

type Props = {
  mode?: "store" | "preview";
  showOrders?: boolean;
};

export function MarketplaceStorefront({ mode = "store", showOrders = true }: Props) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const { isClubMember, lpUrl, ctaSubscriptionUrl } = useFlightReviewClub();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<MarketplaceSettings>(defaultMarketplaceSettings());
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string>("");
  const [buying, setBuying] = useState(false);
  const [tab, setTab] = useState<"loja" | "compras">("loja");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [settingsRow, cats, prods, myOrders] = await Promise.all([
          getMarketplaceSettings(),
          listMarketplaceCategories(false),
          listMarketplaceProducts({ includeInactive: mode === "preview" }),
          showOrders && mode === "store" && user?.id ? listMarketplaceOrders({ buyerUserId: user.id, limit: 100 }) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setSettings(settingsRow);
        setCategories(cats);
        setProducts(mode === "preview" ? prods : prods.filter((p) => p.active));
        setOrders(myOrders);
      } catch {
        if (!cancelled) showToast({ message: "Erro ao carregar o marketplace.", variant: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, showOrders, showToast, user?.id]);

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setVariantId("");
      return;
    }
    setVariantId(selected.variants[0]?.id || "");
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId !== "all" && p.categoryId !== categoryId) return false;
      if (kindFilter !== "all" && p.kind !== kindFilter) return false;
      if (!q) return true;
      const hay = `${p.name} ${p.shortDescription} ${p.description} ${p.attributes.map((a) => `${a.key} ${a.value}`).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, categoryId, kindFilter]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name || "Sem categoria";

  function hasFrcPrice(product: MarketplaceProduct): boolean {
    return product.frcDiscountPercent > 0;
  }

  function openFrcSubscription() {
    const target = (ctaSubscriptionUrl || lpUrl || "/flight-review-club").trim() || "/flight-review-club";
    if (/^https?:\/\//i.test(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(target.startsWith("/") ? target : `/${target}`);
  }

  async function handleBuy(product: MarketplaceProduct) {
    if (mode === "preview") {
      showToast({ message: "Preview: compra desabilitada.", variant: "info" });
      return;
    }
    const out = marketplaceIsOutOfStock(product, variantId);
    if (out) {
      showToast({ message: "Produto fora de estoque.", variant: "error" });
      return;
    }
    if (product.paymentMode === "external") {
      const url = marketplacePaymentUrlForBuyer(product, isClubMember);
      if (!url) {
        showToast({ message: "Link de pagamento não configurado.", variant: "error" });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    setBuying(true);
    try {
      const checkout = await createMarketplaceCheckout({
        productId: product.id,
        variantId: variantId || null,
      });
      if (!checkout.paymentUrl) throw new Error("Link de pagamento não retornado.");
      window.open(checkout.paymentUrl, "_blank", "noopener,noreferrer");
      showToast({ message: "Pedido registrado. Conclua o pagamento na Cakto.", variant: "success" });
      const myOrders = user?.id
        ? await listMarketplaceOrders({ buyerUserId: user.id, limit: 100 })
        : [];
      setOrders(myOrders);
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "Não foi possível iniciar a compra.",
        variant: "error",
      });
    } finally {
      setBuying(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!settings.enabled && mode !== "preview") {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-6 text-sm text-slate-400">
        O marketplace está temporariamente indisponível.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">{settings.storeTitle || "Marketplace"}</h2>
          <p className="mt-1 text-sm text-slate-400">{settings.storeSubtitle}</p>
        </div>
        {showOrders && mode === "store" ? (
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setTab("loja")}
              className={`rounded-md px-3 py-1.5 font-semibold ${tab === "loja" ? "bg-emerald-600 text-white" : "text-slate-400"}`}
            >
              Loja
            </button>
            <button
              type="button"
              onClick={() => setTab("compras")}
              className={`rounded-md px-3 py-1.5 font-semibold ${tab === "compras" ? "bg-emerald-600 text-white" : "text-slate-400"}`}
            >
              Minhas compras
            </button>
          </div>
        ) : null}
      </div>

      {tab === "compras" && mode === "store" ? (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <p className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-6 text-sm text-slate-400">
              Você ainda não tem compras via Cakto registradas.
            </p>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-100">{order.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {order.variantLabel ? `${order.variantLabel} · ` : ""}
                      {new Date(order.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-100">{formatBRL(order.amount)}</p>
                    <p className={`mt-1 text-[11px] font-semibold uppercase ${
                      order.status === "paid" ? "text-emerald-400" : order.status === "pending" ? "text-amber-400" : "text-slate-400"
                    }`}>
                      {order.status === "paid" ? "Pago" : order.status === "pending" ? "Pendente" : order.status}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar produtos..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 sm:max-w-sm"
            />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500"
            >
              <option value="all">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500"
            >
              <option value="all">Todos os tipos</option>
              <option value="physical">Produtos</option>
              <option value="service">Serviços</option>
              <option value="digital">Digitais</option>
            </select>
          </div>

          {categories.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategoryId("all")}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  categoryId === "all"
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    categoryId === c.id
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : "border-slate-700 text-slate-400"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-6 text-sm text-slate-400">
              Nenhum item encontrado.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product) => {
                const out = marketplaceIsOutOfStock(product, product.variants[0]?.id);
                const frcPrice = marketplaceEffectivePrice(product, true);
                const showFrc = hasFrcPrice(product);
                return (
                  <article
                    key={product.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(product.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(product.id);
                      }
                    }}
                    className="cursor-pointer overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/50 text-left transition hover:border-emerald-500/40"
                  >
                    <div className="relative">
                      <ProductImageCarousel images={product.images} alt={product.name} />
                      {out ? (
                        <span className="absolute left-1.5 top-1.5 z-10 rounded bg-rose-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                          Esgotado
                        </span>
                      ) : null}
                      {product.featured ? (
                        <span className="absolute right-1.5 top-1.5 z-10 rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-950">
                          Destaque
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-0.5 p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {categoryName(product.categoryId)} · {kindLabel(product.kind)}
                      </p>
                      <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-100">{product.name}</p>
                      {product.shortDescription ? (
                        <p className="line-clamp-2 text-[11px] text-slate-400">{product.shortDescription}</p>
                      ) : null}
                      {showFrc && isClubMember ? (
                        <div className="pt-0.5">
                          <p className="text-[11px] text-slate-500 line-through">{formatBRL(product.price)}</p>
                          <div className="flex flex-wrap items-baseline gap-1.5">
                            <p className="text-sm font-bold text-amber-300">{formatBRL(frcPrice)}</p>
                            <p className="text-[10px] font-semibold text-amber-200">-{product.frcDiscountPercent}% FRC</p>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-0.5">
                          <p className="text-sm font-bold text-emerald-400">{formatBRL(product.price)}</p>
                          {showFrc ? (
                            <p className="mt-0.5 text-[10px] text-amber-200/90">
                              No FRC: {formatBRL(frcPrice)} (−{product.frcDiscountPercent}%)
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={() => setSelectedId(null)}>
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-950 p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ProductImageCarousel
              images={selected.images}
              alt={selected.name}
              aspectClass="aspect-[16/10]"
              roundedClass="mb-3 rounded-xl"
              large
            />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {categoryName(selected.categoryId)} · {kindLabel(selected.kind)}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-50">{selected.name}</h3>
            {selected.shortDescription ? <p className="mt-1 text-sm text-slate-400">{selected.shortDescription}</p> : null}
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{selected.description}</p>

            {selected.attributes.length > 0 ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {selected.attributes.map((a) => (
                  <div key={`${a.key}-${a.value}`} className="rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1.5">
                    <dt className="text-slate-500">{a.key}</dt>
                    <dd className="font-medium text-slate-200">{a.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {selected.variants.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Opção / tamanho</p>
                <div className="flex flex-wrap gap-2">
                  {selected.variants.map((v) => {
                    const disabled = selected.trackStock && selected.paymentMode === "cakto" && v.stock != null && v.stock <= 0;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setVariantId(v.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          variantId === v.id
                            ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                            : "border-slate-700 text-slate-300"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {v.label}
                        {disabled ? " (esgotado)" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {hasFrcPrice(selected) && isClubMember ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">Seu preço FRC</p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <p className="text-xs text-slate-500 line-through">{formatBRL(selected.price)}</p>
                    <p className="text-xl font-bold text-amber-200">{formatBRL(marketplaceEffectivePrice(selected, true))}</p>
                    <p className="text-xs text-amber-300">-{selected.frcDiscountPercent}%</p>
                  </div>
                  <p className="mt-1 text-xs text-emerald-300">Desconto do clube aplicado na compra.</p>
                </div>
              ) : (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preço</p>
                  <p className="text-xl font-bold text-emerald-400">{formatBRL(selected.price)}</p>
                  {hasFrcPrice(selected) ? (
                    <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                      <p className="text-xs text-amber-100">
                        No Flight Review Club:{" "}
                        <span className="font-semibold">{formatBRL(marketplaceEffectivePrice(selected, true))}</span>
                        {" "}(−{selected.frcDiscountPercent}%)
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300"
                >
                  Fechar
                </button>
                {hasFrcPrice(selected) && !isClubMember ? (
                  <button
                    type="button"
                    onClick={openFrcSubscription}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Assinar FRC
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={buying || marketplaceIsOutOfStock(selected, variantId)}
                  onClick={() => void handleBuy(selected)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {marketplaceIsOutOfStock(selected, variantId)
                    ? "Esgotado"
                    : buying
                      ? "Abrindo..."
                      : hasFrcPrice(selected) && !isClubMember
                        ? `Comprar por ${formatBRL(selected.price)}`
                        : "Comprar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
