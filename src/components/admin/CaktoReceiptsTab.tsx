import { useCallback, useEffect, useState } from "react";
import { listCaktoReceipts } from "../../lib/caktoDb";
import type { CaktoReceipt, CaktoReceiptPage } from "../../types/cakto";
import { useToast } from "../ui/ToastProvider";

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
      <div className="grid gap-3 sm:grid-cols-3">
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
            <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-4 text-xs text-slate-300">{JSON.stringify(JSON.parse(selected.payloadJson), null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
