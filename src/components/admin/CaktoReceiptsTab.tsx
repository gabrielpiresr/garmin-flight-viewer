import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listCaktoReceipts } from "../../lib/caktoDb";
import type { CaktoReceipt, CaktoReceiptPage } from "../../types/cakto";
import { useToast } from "../ui/ToastProvider";
import { getFlightCreditSalesConfig, adminCreateFlightCreditCheckout, sendFlightCreditPaymentLinkEmail } from "../../lib/flightCreditSalesDb";
import type { FlightCreditCheckoutExtraProduct, FlightCreditPackage } from "../../types/flightCreditSales";
import { getCreditPaymentSettings } from "../../lib/lastlinkDb";
import type { CreditPaymentProvider } from "../../types/lastlink";
import { createSchoolProduct, listSchoolProducts } from "../../lib/schoolProductsDb";
import type { SchoolProduct } from "../../types/costs";
import { listAdminUserSummaries, listAdminUsers } from "../../lib/adminUsersDb";
import type { AdminUserSummary } from "../../types/adminUsers";
import { useAuth } from "../../contexts/AuthContext";
import { getStudentDebtCharge, type StudentDebtCharge } from "../../lib/studentReceivables";

const eventLabels: Record<string, string> = {
  purchase_approved: "Compra aprovada",
  purchase_refused: "Compra recusada",
  pix_gerado: "PIX gerado",
  boleto_gerado: "Boleto gerado",
  picpay_gerado: "PicPay gerado",
  openfinance_nubank_gerado: "Open Finance gerado",
  refund: "Reembolso",
  chargeback: "Chargeback",
  subscription_renewed: "Assinatura renovada",
  subscription_canceled: "Assinatura cancelada",
  saga_imported_receipt: "Recebimento importado (SAGA)",
  saga_credit_created: "Crédito lançado (SAGA)",
};
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const defaultEventTypes = ["purchase_approved", "saga_credit_created"];
const allEventTypes = Object.keys(eventLabels);

export type PaymentLinkInitialCharge = {
  packageId: string;
  hours: number;
  hourPrice: number;
  label?: string;
};

export function PaymentLinkModal({
  onClose,
  initialUser = null,
  initialCharge = null,
}: {
  onClose: () => void;
  initialUser?: AdminUserSummary | null;
  initialCharge?: PaymentLinkInitialCharge | null;
}) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(initialUser);
  const [packages, setPackages] = useState<FlightCreditPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [selectedPackageId, setSelectedPackageId] = useState(initialCharge?.packageId ?? "");
  const [productOptions, setProductOptions] = useState<SchoolProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedExtraProductIds, setSelectedExtraProductIds] = useState<string[]>([]);
  const [customHoursInput, setCustomHoursInput] = useState(initialCharge?.hours ? String(initialCharge.hours) : "");
  const [customHourPriceInput, setCustomHourPriceInput] = useState(initialCharge?.hourPrice ? String(initialCharge.hourPrice) : "");
  const [customProductName, setCustomProductName] = useState("");
  const [customProductPriceInput, setCustomProductPriceInput] = useState("");
  const [saveCustomProduct, setSaveCustomProduct] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendEmailAfterGenerate, setSendEmailAfterGenerate] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentProposalId, setPaymentProposalId] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<CreditPaymentProvider>("cakto");

  useEffect(() => {
    void (async () => {
      setPackagesLoading(true);
      try {
        const [config, paymentSettings] = await Promise.all([
          getFlightCreditSalesConfig(),
          getCreditPaymentSettings().catch(() => null),
        ]);
        const active = config.packages.filter((p) => p.active);
        setPackages(active);
        const defaultPackage = initialCharge?.packageId
          ? active.find((item) => item.id === initialCharge.packageId)
          : active.find((item) => item.isDefault) ?? active[0];
        if (defaultPackage) setSelectedPackageId(defaultPackage.id);
        if (paymentSettings?.provider) setPaymentProvider(paymentSettings.provider);
      } catch (e) {
        showToast({ variant: "error", message: (e as Error).message });
      } finally {
        setPackagesLoading(false);
      }
    })();
  }, [initialCharge?.packageId, showToast]);

  useEffect(() => {
    if (!initialCharge) return;
    setSelectedPackageId(initialCharge.packageId);
    setCustomHoursInput(initialCharge.hours ? String(initialCharge.hours) : "");
    setCustomHourPriceInput(initialCharge.hourPrice ? String(initialCharge.hourPrice) : "");
  }, [initialCharge]);

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    void listSchoolProducts(false)
      .then((products) => {
        if (!cancelled) setProductOptions(products);
      })
      .catch(() => {
        if (!cancelled) setProductOptions([]);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setUsers([]); return; }
    setUsersLoading(true);
    try {
      const result = await listAdminUsers(q);
      setUsers(result.filter((u) => u.role === "aluno"));
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setUsersLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const t = setTimeout(() => void searchUsers(search), 300);
    return () => clearTimeout(t);
  }, [search, searchUsers]);

  function packageReferenceForCustomHours(list: FlightCreditPackage[], customHours: number): FlightCreditPackage | null {
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => a.hours - b.hours);
    if (!Number.isFinite(customHours) || customHours <= 0) return sorted[0];
    return [...sorted].reverse().find((item) => item.hours <= customHours) ?? sorted[0];
  }

  const selectedExtraProducts = useMemo<FlightCreditCheckoutExtraProduct[]>(
    () =>
      selectedExtraProductIds
        .map((id) => {
          const product = productOptions.find((item) => item.id === id);
          return product
            ? {
                id: product.id,
                name: product.name,
                price: product.idealPrice,
              }
            : null;
        })
        .filter((item): item is FlightCreditCheckoutExtraProduct => item !== null),
    [productOptions, selectedExtraProductIds],
  );

  const parsedCustomProductPrice = Number(customProductPriceInput.replace(",", "."));
  const customProductPrice = Number.isFinite(parsedCustomProductPrice) ? Math.round(parsedCustomProductPrice * 100) / 100 : 0;
  const customProductReady = customProductName.trim().length > 0 && customProductPrice > 0;
  const customExtraProduct = useMemo<FlightCreditCheckoutExtraProduct | null>(
    () =>
      customProductReady
        ? {
            id: `custom_${customProductName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "produto"}`,
            name: customProductName.trim(),
            price: customProductPrice,
            custom: true,
          }
        : null,
    [customProductName, customProductPrice, customProductReady],
  );

  const extrasTotal = useMemo(
    () => selectedExtraProducts.reduce((sum, item) => sum + item.price, 0) + (customExtraProduct?.price ?? 0),
    [customExtraProduct?.price, selectedExtraProducts],
  );

  function toggleExtraProduct(productId: string) {
    setSelectedExtraProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  async function sendPaymentEmail(url: string, proposalId: string | null = paymentProposalId) {
    if (!selectedUser || !url || emailSending) return;
    setEmailSending(true);
    try {
      const result = await sendFlightCreditPaymentLinkEmail(selectedUser.userId, url, proposalId || undefined);
      setEmailSentTo(result.email);
      showToast({ variant: "success", message: `Email enviado para ${result.email}.` });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setEmailSending(false);
    }
  }

  async function buildExtraProductsForCheckout(): Promise<FlightCreditCheckoutExtraProduct[]> {
    const extras = [...selectedExtraProducts];
    if (!customExtraProduct) return extras;
    if (!saveCustomProduct) return [...extras, customExtraProduct];
    const saved = await createSchoolProduct({ name: customExtraProduct.name, idealPrice: customExtraProduct.price });
    setProductOptions((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    return [...extras, { id: saved.id, name: saved.name, price: saved.idealPrice }];
  }

  async function handleGenerate(customHours?: number, customHourPrice?: number) {
    if (!selectedUser) return;
    setGenerating(true);
    setEmailSentTo(null);
    try {
      const extraProducts = await buildExtraProductsForCheckout();
      if (!selectedPackageId && extraProducts.length === 0) {
        showToast({ variant: "error", message: "Selecione um pacote de horas ou pelo menos um produto adicional." });
        return;
      }
      const checkout = await adminCreateFlightCreditCheckout(
        selectedUser.userId,
        selectedPackageId,
        customHours,
        customHourPrice,
        false,
        extraProducts,
      );
      setPaymentUrl(checkout.paymentUrl);
      setPaymentProposalId(checkout.proposalId);
      if (checkout.provider) setPaymentProvider(checkout.provider);
      if (sendEmailAfterGenerate) {
        await sendPaymentEmail(checkout.paymentUrl, checkout.proposalId);
      }
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  const selectedPackage = packages.find((p) => p.id === selectedPackageId);
  const parsedCustomHours = Number(customHoursInput.replace(",", "."));
  const customHours = Number.isFinite(parsedCustomHours) ? Math.round(parsedCustomHours * 10) / 10 : 0;
  const parsedCustomHourPrice = Number(customHourPriceInput.replace(",", "."));
  const customHourPrice = Number.isFinite(parsedCustomHourPrice) ? Math.round(parsedCustomHourPrice * 100) / 100 : 0;
  const customReference = packageReferenceForCustomHours(packages, customHours);
  const appliedHourPrice = customHourPrice > 0 ? customHourPrice : customReference?.hourPrice ?? 0;
  const customTotal = customReference && customHours > 0 && appliedHourPrice > 0 ? customHours * appliedHourPrice : null;
  const selectedPackageTotal = selectedPackage ? selectedPackage.hours * selectedPackage.hourPrice : 0;
  const mainLinkTotal = selectedPackageTotal + extrasTotal;
  const hasExtraProducts = selectedExtraProducts.length > 0 || Boolean(customExtraProduct);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Gerar link de pagamento</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs">Fechar</button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Provedor ativo: {paymentProvider === "lastlink" ? "LastLink" : "Cakto"} (altera em Configurações → Financeiro)
        </p>

        {paymentUrl ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-emerald-300">Link gerado com sucesso!</p>
            {emailSentTo ? (
              <p className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
                Email enviado para {emailSentTo}.
              </p>
            ) : null}
            <div className="rounded-lg border border-slate-800 bg-black/30 p-3">
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-sky-400 underline">{paymentUrl}</a>
            </div>
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(paymentUrl); showToast({ variant: "success", message: "Link copiado!" }); }}
              className="w-full rounded-lg border border-slate-700 py-2 text-xs text-slate-300 hover:bg-slate-800 transition"
            >
              Copiar link
            </button>
            <button
              type="button"
              disabled={!selectedUser || emailSending}
              onClick={() => void sendPaymentEmail(paymentUrl)}
              className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {emailSending ? "Enviando..." : emailSentTo ? "Reenviar por email" : "Enviar por email ao aluno"}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Aluno</label>
              <input
                value={selectedUser ? (selectedUser.name || selectedUser.email) : search}
                onChange={(e) => { setSearch(e.target.value); setSelectedUser(null); setPaymentUrl(null); setPaymentProposalId(null); setEmailSentTo(null); }}
                placeholder="Buscar aluno por nome ou e-mail..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
              />
              {!selectedUser && users.length > 0 && (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900">
                  {usersLoading ? (
                    <li className="px-3 py-2 text-xs text-slate-500">Buscando...</li>
                  ) : (
                    users.map((u) => (
                      <li key={u.userId}>
                        <button
                          type="button"
                          onClick={() => { setSelectedUser(u); setSearch(""); setUsers([]); setEmailSentTo(null); }}
                          className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800"
                        >
                          <span className="font-medium">{u.name || u.email}</span>
                          {u.name ? <span className="ml-1 text-slate-500">{u.email}</span> : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
              {selectedUser && (
                <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-slate-200">{selectedUser.name || selectedUser.email}</p>
                    {selectedUser.name ? <p className="text-[10px] text-slate-500">{selectedUser.email}</p> : null}
                  </div>
                  <button type="button" onClick={() => { setSelectedUser(null); setEmailSentTo(null); }} className="text-[10px] text-slate-500 hover:text-slate-300">Trocar</button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Pacote de horas</label>
              {packagesLoading ? (
                <div className="h-9 animate-pulse rounded-lg bg-slate-800" />
              ) : (
                <select
                  value={selectedPackageId}
                  onChange={(e) => setSelectedPackageId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  <option value="">Sem horas - somente produtos adicionais</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.hours}h - {money(p.hours * p.hourPrice)} ({p.aircraftModelName || "-"}){p.isDefault ? " - default" : ""}
                    </option>
                  ))}
                </select>
              )}
              {!packagesLoading && packages.length === 0 ? (
                <p className="mt-1 text-[10px] text-amber-400">Nenhum pacote ativo configurado. Ainda e possivel gerar link somente com produtos adicionais.</p>
              ) : null}
              {selectedPackage && (
                <p className="mt-1 text-[10px] text-slate-500">
                  {selectedPackage.hours}h x {money(selectedPackage.hourPrice)}/h = {money(selectedPackage.hours * selectedPackage.hourPrice)} - validade {selectedPackage.validityDays} dias
                </p>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-300">Produtos adicionais</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Inclua produtos e servicos no mesmo link.</p>
                </div>
                {selectedExtraProducts.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelectedExtraProductIds([])}
                    className="shrink-0 text-[11px] font-medium text-slate-500 hover:text-slate-300"
                  >
                    Limpar
                  </button>
                ) : null}
              </div>
              {productsLoading ? (
                <p className="text-xs text-slate-500">Carregando produtos...</p>
              ) : productOptions.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum produto ativo cadastrado.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {productOptions.map((product) => {
                    const checked = selectedExtraProductIds.includes(product.id);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => toggleExtraProduct(product.id)}
                        className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                          checked
                            ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                            : "border-slate-700/70 bg-slate-950/30 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          checked ? "border-emerald-400 bg-emerald-500 text-white" : "border-slate-600"
                        }`}>
                          {checked ? "x" : ""}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">{product.name}</span>
                          <span className="mt-0.5 block text-[11px] text-emerald-300">{money(product.idealPrice)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {hasExtraProducts ? (
                <p className="mt-2 text-[11px] text-slate-400">Extras: {money(extrasTotal)}</p>
              ) : null}
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs font-semibold text-slate-300">Produto personalizado</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem]">
                  <input
                    value={customProductName}
                    onChange={(e) => setCustomProductName(e.target.value)}
                    placeholder="Nome do produto"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={customProductPriceInput}
                    onChange={(e) => setCustomProductPriceInput(e.target.value)}
                    placeholder="Valor"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={saveCustomProduct}
                    onChange={(e) => setSaveCustomProduct(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-sky-500 focus:ring-sky-500"
                  />
                  Salvar esse produto
                </label>
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={sendEmailAfterGenerate}
                onChange={(e) => setSendEmailAfterGenerate(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-sky-500 focus:ring-sky-500"
              />
              Enviar por email ao aluno assim que gerar o link
            </label>

            <button
              type="button"
              disabled={!selectedUser || (!selectedPackageId && !hasExtraProducts) || generating || emailSending}
              onClick={() => void handleGenerate()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2 text-xs font-medium text-white hover:bg-sky-500 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(generating || emailSending) && <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
              {generating ? "Gerando..." : emailSending ? "Enviando email..." : `Gerar link${mainLinkTotal > 0 ? ` - ${money(mainLinkTotal)}` : ""}`}
            </button>

            <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Quantidade personalizada</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {initialCharge?.label ?? "Digite horas e valor/hora. A validade ainda usa o pacote de referência."}
              </p>
              <div className="mt-2">
                <input
                  type="number"
                  min="0.5"
                  step="0.1"
                  inputMode="decimal"
                  value={customHoursInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === "" || /^\d*[.,]?\d{0,1}$/.test(next)) setCustomHoursInput(next);
                  }}
                  placeholder="Ex.: 1.1"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="mt-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={customHourPriceInput}
                  onChange={(e) => setCustomHourPriceInput(e.target.value)}
                  placeholder="Valor por hora (ex.: 950)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              {customReference && customHours > 0 ? (
                <p className="mt-2 text-[11px] text-slate-300">
                  Referência: {customReference.hours}h · validade {customReference.validityDays} dias · valor/h {money(appliedHourPrice)} · total {customTotal ? money(customTotal) : "—"}
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-slate-500">Informe as horas para calcular a referência.</p>
              )}
              <button
                type="button"
                disabled={!selectedUser || !selectedPackageId || generating || emailSending || packages.length === 0 || customHours < 0.5 || customHourPrice <= 0 || !customReference}
                onClick={() => void handleGenerate(customHours, customHourPrice)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {(generating || emailSending) && <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                {generating ? "Gerando..." : emailSending ? "Enviando email..." : `Gerar link personalizado${customTotal ? ` - ${money(customTotal + extrasTotal)}` : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function parseDateMs(value: string | null | undefined): number {
  if (!value) return 0;
  const iso = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDate(value: string | null | undefined): string {
  const ms = parseDateMs(value);
  if (!ms) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(ms));
}

function cutoffDateForDays(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Math.max(1, Math.round(days)));
  return date;
}

function PendingReceivablesTab({ onCharge }: { onCharge: (charge: StudentDebtCharge) => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [lastFlightDays, setLastFlightDays] = useState(30);
  const [lastFlightDaysDraft, setLastFlightDaysDraft] = useState("30");
  const [rows, setRows] = useState<StudentDebtCharge[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const loadSeqRef = useRef(0);

  const loadPending = useCallback(async () => {
    if (!user) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setRows([]);
    setScanStatus("Carregando alunos...");
    try {
      const students: AdminUserSummary[] = [];
      let nextOffset = 0;
      let total = 0;
      do {
        const page = await listAdminUserSummaries({
          search: "",
          limit: 50,
          offset: nextOffset,
        });
        if (seq !== loadSeqRef.current) return;
        total = page.total;
        students.push(...page.users.filter((row) => row.role === "aluno"));
        nextOffset += page.limit;
        setScanStatus(`Carregando alunos ${Math.min(nextOffset, total)} de ${total}...`);
      } while (nextOffset < total);

      const cutoffMs = cutoffDateForDays(lastFlightDays).getTime();
      const recentStudents = students.filter((student) => parseDateMs(student.executed.lastFlightAt) >= cutoffMs);
      setScanStatus(`Calculando pendencias de ${recentStudents.length} aluno(s)...`);

      const found: StudentDebtCharge[] = [];
      for (let index = 0; index < recentStudents.length; index += 4) {
        const chunk = recentStudents.slice(index, index + 4);
        const results = await Promise.allSettled(
          chunk.map((student) =>
            getStudentDebtCharge({
              viewer: { userId: user.id, role: user.role },
              student,
            }),
          ),
        );
        if (seq !== loadSeqRef.current) return;
        for (const result of results) {
          if (result.status === "fulfilled" && result.value) found.push(result.value);
        }
        setRows([...found].sort((a, b) => b.amount - a.amount || parseDateMs(b.lastFlightAt) - parseDateMs(a.lastFlightAt)));
        setScanStatus(`Calculando pendencias ${Math.min(index + chunk.length, recentStudents.length)} de ${recentStudents.length}...`);
      }
      setScanStatus(`${found.length} aluno(s) em debito encontrados.`);
    } catch (error) {
      if (seq === loadSeqRef.current) {
        showToast({ variant: "error", message: (error as Error).message });
        setScanStatus("Falha ao carregar pendencias.");
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [lastFlightDays, showToast, user]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  function handleApplyFilter() {
    const nextDays = Math.max(1, Math.round(Number(lastFlightDaysDraft) || 30));
    setLastFlightDaysDraft(String(nextDays));
    if (nextDays === lastFlightDays) {
      void loadPending();
    } else {
      setLastFlightDays(nextDays);
    }
  }

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const totalHours = rows.reduce((sum, row) => sum + row.debtHours, 0);
  const filterCls = "rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-200";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Alunos em debito</p>
          <p className="mt-1 text-xl font-bold text-amber-300">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Horas em aberto</p>
          <p className="mt-1 text-xl font-bold text-slate-100">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Valor a cobrar</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">{money(totalAmount)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
        <label className="text-xs text-slate-400">
          Ultimo voo nos ultimos
          <input
            type="number"
            min="1"
            max="3650"
            value={lastFlightDaysDraft}
            onChange={(event) => setLastFlightDaysDraft(event.target.value)}
            className={`${filterCls} ml-2 w-24`}
          />
          <span className="ml-2">dias</span>
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={handleApplyFilter}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Calculando..." : "Recalcular"}
        </button>
        <span className="text-xs text-slate-500">{scanStatus}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              {["Aluno", "Ultimo voo", "Horas em debito", "Pacote vigente", "Valor", ""].map((item) => (
                <th key={item} className="px-3 py-3 text-left">{item}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && rows.length === 0 ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`pending-sk-${index}`}>
                  {Array.from({ length: 6 }).map((__, colIndex) => (
                    <td key={`${index}-${colIndex}`} className="px-3 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-800/80" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.map((row) => (
              <tr key={row.student.userId} className="text-slate-300">
                <td className="px-3 py-3">
                  <p className="font-medium text-slate-100">{row.student.name || row.student.profile.fullName || row.student.email}</p>
                  <p className="text-slate-500">{row.student.email}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-3">{formatDate(row.lastFlightAt)}</td>
                <td className="px-3 py-3 font-semibold text-amber-300">{row.debtHours.toFixed(1)}h</td>
                <td className="px-3 py-3">
                  <p>{row.packageName}</p>
                  {row.hourPrice > 0 ? <p className="text-slate-500">{money(row.hourPrice)}/h</p> : null}
                </td>
                <td className="px-3 py-3 font-semibold text-emerald-300">{row.amount > 0 ? money(row.amount) : "-"}</td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    disabled={!row.packageId || row.amount <= 0}
                    onClick={() => onCharge(row)}
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cobrar
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">Nenhum aluno em debito nesse periodo.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CaktoReceiptsTab() {
  const { showToast } = useToast();
  const [activeReceiptsSubTab, setActiveReceiptsSubTab] = useState<"received" | "pending">("received");
  const [page, setPage] = useState<CaktoReceiptPage>({ receipts: [], total: 0, limit: 25, offset: 0, summary: { approved: 0, refunded: 0, pending: 0 } });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [source, setSource] = useState<"all" | "cakto" | "saga">("all");
  const [eventTypes, setEventTypes] = useState<string[]>(defaultEventTypes);
  const [fullScan, setFullScan] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<CaktoReceipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalUser, setPaymentModalUser] = useState<AdminUserSummary | null>(null);
  const [paymentModalCharge, setPaymentModalCharge] = useState<PaymentLinkInitialCharge | null>(null);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const nextPage = await listCaktoReceipts({
        search: debouncedSearch,
        source,
        eventTypes,
        paymentMethod,
        dateFrom,
        dateTo,
        limit: 25,
        offset,
        fullScan,
        recentLimit: 80,
      });
      if (seq === loadSeqRef.current) setPage(nextPage);
    } catch (error) {
      if (seq === loadSeqRef.current) showToast({ variant: "error", message: (error as Error).message });
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [dateFrom, dateTo, debouncedSearch, eventTypes, fullScan, offset, paymentMethod, showToast, source]);

  useEffect(() => { void load(); }, [load]);

  function renderRowsSkeleton() {
    return Array.from({ length: 6 }).map((_, idx) => (
      <tr key={`sk-${idx}`} className="text-slate-300">
        {Array.from({ length: 9 }).map((__, colIdx) => (
          <td key={`sk-${idx}-${colIdx}`} className="px-3 py-3">
            <div className="h-4 w-full animate-pulse rounded bg-slate-800/80" />
          </td>
        ))}
      </tr>
    ));
  }

  const filterCls = "rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-200";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveReceiptsSubTab("received")}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            activeReceiptsSubTab === "received"
              ? "bg-sky-600 text-white"
              : "border border-slate-700 text-slate-300 hover:bg-slate-800"
          }`}
        >
          Recebidos
        </button>
        <button
          type="button"
          onClick={() => setActiveReceiptsSubTab("pending")}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            activeReceiptsSubTab === "pending"
              ? "bg-amber-600 text-white"
              : "border border-slate-700 text-slate-300 hover:bg-slate-800"
          }`}
        >
          Pendentes
        </button>
      </div>

      {activeReceiptsSubTab === "pending" ? (
        <PendingReceivablesTab
          onCharge={(charge) => {
            setPaymentModalUser(charge.student);
            setPaymentModalCharge({
              packageId: charge.packageId,
              hours: charge.debtHours,
              hourPrice: charge.hourPrice,
              label: `Saldo em debito: ${charge.debtHours.toFixed(1)}h x ${money(charge.hourPrice)}/h = ${money(charge.amount)}.`,
            });
            setShowPaymentModal(true);
          }}
        />
      ) : null}

      <div className={activeReceiptsSubTab === "received" ? "space-y-4" : "hidden"}>
      <div className="flex items-center justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          {[
            ["Aprovados", page.summary.approved, "text-emerald-300"],
            ["Reembolsados/chargeback", page.summary.refunded, "text-rose-300"],
            ["Cobranças abertas", page.summary.pending, "text-amber-300"],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`mt-1 text-xl font-bold ${color}`}>{money(Number(value))}</p>
            </div>
          ))}
        </div>
        <div className="ml-4 flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => window.open("/admin/comprar-creditos", "_blank", "noopener,noreferrer")}
            className="rounded-lg border border-emerald-700/50 bg-emerald-600/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-600/20 transition"
          >
            Tablet da escola
          </button>
          <button
            type="button"
            onClick={() => {
              setPaymentModalUser(null);
              setPaymentModalCharge(null);
              setShowPaymentModal(true);
            }}
            className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 transition"
          >
            Gerar link de pagamento
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2">
        <span className="text-xs text-slate-400">
          {fullScan ? "Histórico completo" : "Últimos lançamentos"}
        </span>
        <div className="flex flex-wrap gap-2">
          {!fullScan ? (
            <button
              type="button"
              onClick={() => {
                setFullScan(true);
                setEventTypes(allEventTypes);
                setOffset(0);
              }}
              className="rounded-lg border border-sky-700/60 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-950/40"
            >
              Carregar todos os eventos
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFullScan(false);
                setEventTypes(defaultEventTypes);
                setOffset(0);
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Ver últimos lançamentos
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} placeholder="Cliente, e-mail, pedido ou oferta" className={`${filterCls} min-w-64 flex-1`} />
        <select value={source} onChange={(e) => { setSource(e.target.value as "all" | "cakto" | "saga"); setOffset(0); }} className={filterCls}>
          <option value="all">Todas as origens</option>
          <option value="cakto">Somente Cakto</option>
          <option value="saga">Somente SAGA</option>
        </select>
        <div className={`${filterCls} min-w-64`}>
          <p className="mb-1 text-[11px] text-slate-400">Eventos ({eventTypes.length})</p>
          <select
            multiple
            value={eventTypes}
            onChange={(e) => {
              const selectedValues = Array.from(e.currentTarget.selectedOptions).map((option) => option.value);
              setEventTypes(selectedValues);
              setOffset(0);
            }}
            className="min-h-28 w-full rounded border border-slate-700 bg-slate-950/70 px-2 py-1 text-xs text-slate-200"
          >
            {Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <input value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setOffset(0); }} placeholder="Meio de pagamento" className={filterCls} />
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }} className={filterCls} />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setOffset(0); }} className={filterCls} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-900 text-slate-400"><tr>
            {["Data", "Origem", "Evento", "Cliente", "Pedido / oferta", "Pagamento", "Valor", "Creditos", ""].map((item) => <th key={item} className="px-3 py-3 text-left">{item}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? renderRowsSkeleton() : page.receipts.map((row) => (
              <tr key={row.id} className="text-slate-300">
                <td className="whitespace-nowrap px-3 py-3">{new Date(row.eventAt || row.receivedAt).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    row.source === "saga"
                      ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                      : "border-sky-500/40 bg-sky-500/10 text-sky-300"
                  }`}>
                    {row.source === "saga" ? "SAGA" : "Cakto"}
                  </span>
                </td>
                <td className="px-3 py-3"><p>{eventLabels[row.eventType] || row.eventType}</p><p className="text-slate-500">{row.status}</p></td>
                <td className="px-3 py-3"><p>{row.customerName || "—"}</p><p className="text-slate-500">{row.customerEmail}</p></td>
                <td className="px-3 py-3 font-mono"><p>{row.orderId || "—"}</p><p className="text-slate-500">{row.offerId || "—"}</p></td>
                <td className="px-3 py-3">{row.paymentMethod || "—"}</td>
                <td className="px-3 py-3 font-semibold">{money(row.amount)}</td>
                <td className="px-3 py-3">
                  {row.fulfillmentStatus ? (
                    <>
                      <p className={row.fulfillmentStatus === "completed" ? "text-emerald-300" : row.fulfillmentStatus === "failed" ? "text-red-300" : "text-slate-400"}>
                        {row.fulfillmentStatus === "completed" ? "Liberado" : row.fulfillmentStatus === "failed" ? "Falhou" : row.fulfillmentStatus}
                      </p>
                      {row.creditId ? <p className="font-mono text-[10px] text-slate-500">{row.creditId}</p> : null}
                      {row.sagaStatus ? (
                        <p className={row.sagaStatus === "completed" || row.sagaStatus === "already_exists" ? "text-emerald-300" : row.sagaStatus === "failed" ? "text-red-300" : "text-amber-300"}>
                          SAGA: {row.sagaStatus === "completed" ? "lancado" : row.sagaStatus === "already_exists" ? "ja lancado" : row.sagaStatus}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </td>
                <td className="px-3 py-3"><button type="button" onClick={() => setSelected(row)} className="text-sky-400">Detalhes</button></td>
              </tr>
            ))}
            {!loading && page.receipts.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Nenhum recebimento encontrado.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{page.total} registros</span>
        <div className="flex gap-2">
          <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))} className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40">Anterior</button>
          <button type="button" disabled={offset + page.limit >= page.total} onClick={() => setOffset(offset + 25)} className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40">Próxima</button>
        </div>
      </div>
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between"><h2 className="font-semibold text-slate-100">Payload Cakto</h2><button onClick={() => setSelected(null)} className="text-slate-400">Fechar</button></div>
            {selected.fulfillmentError ? (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
                <p className="font-semibold">Falha ao liberar creditos</p>
                <p className="mt-1 text-xs">{selected.fulfillmentError}</p>
              </div>
            ) : null}
            {selected.sagaError ? (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
                <p className="font-semibold">Falha ao lancar o credito no SAGA</p>
                <p className="mt-1 text-xs">{selected.sagaError}</p>
              </div>
            ) : null}
            <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-4 text-xs text-slate-300">{JSON.stringify(JSON.parse(selected.payloadJson), null, 2)}</pre>
          </div>
        </div>
      ) : null}
      </div>
      {showPaymentModal ? (
        <PaymentLinkModal
          onClose={() => setShowPaymentModal(false)}
          initialUser={paymentModalUser}
          initialCharge={paymentModalCharge}
        />
      ) : null}
    </div>
  );
}
