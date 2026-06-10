import { useCallback, useEffect, useState } from "react";
import { listCaktoReceipts } from "../../lib/caktoDb";
import type { CaktoReceipt, CaktoReceiptPage } from "../../types/cakto";
import { useToast } from "../ui/ToastProvider";
import { getFlightCreditSalesConfig, adminCreateFlightCreditCheckout } from "../../lib/flightCreditSalesDb";
import type { FlightCreditPackage } from "../../types/flightCreditSales";
import { listAdminUsers } from "../../lib/adminUsersDb";
import type { AdminUserSummary } from "../../types/adminUsers";

const eventLabels: Record<string, string> = {
  purchase_approved: "Compra aprovada",
  purchase_refused: "Compra recusada",
  pix_gerado: "PIX gerado",
  boleto_gerado: "Boleto gerado",
  picpay_gerado: "PicPay gerado",
  openfinance_nubank_gerado: "Open Finance gerado",
  refund: "Reembolso",
  chargeback: "Chargeback",
};
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PaymentLinkModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [packages, setPackages] = useState<FlightCreditPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [customHoursInput, setCustomHoursInput] = useState("");
  const [customHourPriceInput, setCustomHourPriceInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setPackagesLoading(true);
      try {
        const config = await getFlightCreditSalesConfig();
        const active = config.packages.filter((p) => p.active);
        setPackages(active);
        if (active.length > 0) setSelectedPackageId(active[0].id);
      } catch (e) {
        showToast({ variant: "error", message: (e as Error).message });
      } finally {
        setPackagesLoading(false);
      }
    })();
  }, [showToast]);

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

  async function handleGenerate(customHours?: number, customHourPrice?: number) {
    if (!selectedUser || !selectedPackageId) return;
    setGenerating(true);
    try {
      const checkout = await adminCreateFlightCreditCheckout(
        selectedUser.userId,
        selectedPackageId,
        customHours,
        customHourPrice,
      );
      setPaymentUrl(checkout.paymentUrl);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  const selectedPackage = packages.find((p) => p.id === selectedPackageId);
  const parsedCustomHours = Number(customHoursInput.replace(",", "."));
  const customHours = Number.isFinite(parsedCustomHours) ? Math.round(parsedCustomHours * 100) / 100 : 0;
  const parsedCustomHourPrice = Number(customHourPriceInput.replace(",", "."));
  const customHourPrice = Number.isFinite(parsedCustomHourPrice) ? Math.round(parsedCustomHourPrice * 100) / 100 : 0;
  const customReference = packageReferenceForCustomHours(packages, customHours);
  const appliedHourPrice = customHourPrice > 0 ? customHourPrice : customReference?.hourPrice ?? 0;
  const customTotal = customReference && customHours > 0 && appliedHourPrice > 0 ? customHours * appliedHourPrice : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Gerar link de pagamento</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs">Fechar</button>
        </div>

        {paymentUrl ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-emerald-300">Link gerado com sucesso!</p>
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
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Aluno</label>
              <input
                value={selectedUser ? (selectedUser.name || selectedUser.email) : search}
                onChange={(e) => { setSearch(e.target.value); setSelectedUser(null); setPaymentUrl(null); }}
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
                          onClick={() => { setSelectedUser(u); setSearch(""); setUsers([]); }}
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
                  <button type="button" onClick={() => setSelectedUser(null)} className="text-[10px] text-slate-500 hover:text-slate-300">Trocar</button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Pacote de horas</label>
              {packagesLoading ? (
                <div className="h-9 animate-pulse rounded-lg bg-slate-800" />
              ) : packages.length === 0 ? (
                <p className="text-xs text-amber-400">Nenhum pacote ativo configurado em Admin &gt; Configurações &gt; Financeiro.</p>
              ) : (
                <select
                  value={selectedPackageId}
                  onChange={(e) => setSelectedPackageId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.hours}h — {money(p.hours * p.hourPrice)} ({p.aircraftModelName || "—"})
                    </option>
                  ))}
                </select>
              )}
              {selectedPackage && (
                <p className="mt-1 text-[10px] text-slate-500">
                  {selectedPackage.hours}h × {money(selectedPackage.hourPrice)}/h = {money(selectedPackage.hours * selectedPackage.hourPrice)} · validade {selectedPackage.validityDays} dias
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={!selectedUser || !selectedPackageId || generating || packages.length === 0}
              onClick={() => void handleGenerate()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2 text-xs font-medium text-white hover:bg-sky-500 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating && <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
              {generating ? "Gerando..." : "Gerar link"}
            </button>

            <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Quantidade personalizada</p>
              <p className="mt-1 text-[11px] text-slate-400">Digite horas e valor/hora. A validade ainda usa o pacote de referência.</p>
              <div className="mt-2">
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={customHoursInput}
                  onChange={(e) => setCustomHoursInput(e.target.value)}
                  placeholder="Ex.: 11.5"
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
                disabled={!selectedUser || generating || packages.length === 0 || customHours < 0.5 || customHourPrice <= 0 || !customReference}
                onClick={() => void handleGenerate(customHours, customHourPrice)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating && <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                {generating ? "Gerando..." : "Gerar link personalizado"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CaktoReceiptsTab() {
  const { showToast } = useToast();
  const [page, setPage] = useState<CaktoReceiptPage>({ receipts: [], total: 0, limit: 25, offset: 0, summary: { approved: 0, refunded: 0, pending: 0 } });
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<CaktoReceipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPage(await listCaktoReceipts({ search, eventType, paymentMethod, dateFrom, dateTo, limit: 25, offset }));
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, eventType, offset, paymentMethod, search, showToast]);

  useEffect(() => { void load(); }, [load]);

  const filterCls = "rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-200";
  return (
    <div className="space-y-4">
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
        <div className="ml-4 shrink-0">
          <button
            type="button"
            onClick={() => setShowPaymentModal(true)}
            className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 transition"
          >
            Gerar link de pagamento
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} placeholder="Cliente, e-mail, pedido ou oferta" className={`${filterCls} min-w-64 flex-1`} />
        <select value={eventType} onChange={(e) => { setEventType(e.target.value); setOffset(0); }} className={filterCls}>
          <option value="">Todos os eventos</option>
          {Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setOffset(0); }} placeholder="Meio de pagamento" className={filterCls} />
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }} className={filterCls} />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setOffset(0); }} className={filterCls} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-900 text-slate-400"><tr>
            {["Data", "Evento", "Cliente", "Pedido / oferta", "Pagamento", "Valor", "Creditos", ""].map((item) => <th key={item} className="px-3 py-3 text-left">{item}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-800">
            {page.receipts.map((row) => (
              <tr key={row.id} className="text-slate-300">
                <td className="whitespace-nowrap px-3 py-3">{new Date(row.eventAt || row.receivedAt).toLocaleString("pt-BR")}</td>
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
            {!loading && page.receipts.length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Nenhum recebimento encontrado.</td></tr> : null}
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
      {showPaymentModal ? <PaymentLinkModal onClose={() => setShowPaymentModal(false)} /> : null}
    </div>
  );
}
