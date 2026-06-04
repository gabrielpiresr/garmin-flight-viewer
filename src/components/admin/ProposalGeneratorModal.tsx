import { useEffect, useState } from "react";
import { createProposal, getProposalsByLead } from "../../lib/crmProposalsDb";
import { getProposalConfig } from "../../lib/proposalSettingsDb";
import { openProposalPdf } from "../../lib/proposalPdf";
import { updateLead } from "../../lib/crmDb";
import { listSchoolProducts } from "../../lib/schoolProductsDb";
import type { CrmLead } from "../../types/crm";
import type { CrmProposal, ProposalProduct } from "../../types/proposal";
import type { SchoolProduct } from "../../types/costs";
import { useToast } from "../ui/ToastProvider";

function parseBrl(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function formatBrl(value: number): string {
  if (value === 0) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none";

type Props = {
  lead: CrmLead;
  onClose: () => void;
  onProposalCreated?: () => void;
};

export function ProposalGeneratorModal({ lead, onClose, onProposalCreated }: Props) {
  const { showToast } = useToast();

  const [hours, setHours] = useState(lead.desiredHours ? String(lead.desiredHours) : "");
  const [hourPriceStr, setHourPriceStr] = useState("");
  const [products, setProducts] = useState<SchoolProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdProposal, setCreatedProposal] = useState<CrmProposal | null>(null);
  const [existingProposals, setExistingProposals] = useState<CrmProposal[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);

  useEffect(() => {
    Promise.all([
      listSchoolProducts().then(setProducts),
      getProposalsByLead(lead.id).then(setExistingProposals),
    ]).finally(() => {
      setLoadingProducts(false);
      setLoadingExisting(false);
    });
  }, [lead.id]);

  const hourNum = Number.parseFloat(hours) || 0;
  const hourPrice = parseBrl(hourPriceStr);
  const totalValue = Math.round(hourNum * hourPrice * 100) / 100;

  function toggleProduct(id: string) {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (hourNum <= 0) {
      showToast({ variant: "warning", message: "Informe a quantidade de horas." });
      return;
    }
    if (hourPrice <= 0) {
      showToast({ variant: "warning", message: "Informe o valor por hora." });
      return;
    }

    setSaving(true);
    try {
      const selectedProducts: ProposalProduct[] = products
        .filter((p) => selectedProductIds.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, price: p.idealPrice }));

      const { data, error } = await createProposal({
        leadId: lead.id,
        leadName: lead.name,
        leadEmail: lead.email,
        hours: hourNum,
        hourPrice,
        products: selectedProducts,
      });

      if (error || !data) throw error ?? new Error("Erro ao criar proposta");

      await updateLead(lead.id, { crmStatus: "proposta_enviada" });

      setCreatedProposal(data);
      setExistingProposals((prev) => [data, ...prev]);
      onProposalCreated?.();
      showToast({ variant: "success", message: "Proposta criada! Lead movido para 'Proposta enviada'." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPdf(proposal: CrmProposal) {
    const config = await getProposalConfig();
    if (!config) {
      showToast({ variant: "warning", message: "Configure a proposta em Configurações → Propostas primeiro." });
      return;
    }
    openProposalPdf(proposal, config);
  }

  function proposalUrl(token: string): string {
    return `${window.location.origin}/proposta/${token}`;
  }

  function copyUrl(token: string) {
    void navigator.clipboard.writeText(proposalUrl(token));
    showToast({ variant: "success", message: "Link copiado!" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Gerar proposta</h2>
            <p className="text-xs text-slate-500 mt-0.5">{lead.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Proposta criada — confirmação */}
          {createdProposal && (
            <div className="rounded-lg border border-emerald-700/40 bg-emerald-900/20 p-4 space-y-3">
              <p className="text-sm font-semibold text-emerald-300">✓ Proposta criada com sucesso!</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={proposalUrl(createdProposal.publicToken)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300 font-mono"
                />
                <button
                  type="button"
                  onClick={() => copyUrl(createdProposal.publicToken)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800 transition"
                >
                  Copiar
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleExportPdf(createdProposal)}
                className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-500 transition"
              >
                Exportar PDF
              </button>
            </div>
          )}

          {/* Propostas anteriores */}
          {!loadingExisting && existingProposals.length > 0 && !createdProposal && (
            <div className="rounded-lg border border-slate-700/40 bg-slate-900/30 p-4">
              <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Propostas anteriores</p>
              <div className="space-y-2">
                {existingProposals.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300">{p.hours}h × {p.hourPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} = <strong>{p.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></p>
                      <p className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyUrl(p.publicToken)}
                      className="text-xs text-sky-400 hover:text-sky-300 transition"
                    >
                      Copiar link
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportPdf(p)}
                      className="text-xs text-slate-400 hover:text-slate-300 transition"
                    >
                      PDF
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulário nova proposta */}
          {!createdProposal && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-400">Horas de voo</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder="Ex: 40"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Valor por hora (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={hourPriceStr}
                    onChange={(e) => setHourPriceStr(e.target.value)}
                    onBlur={() => { if (hourPrice > 0) setHourPriceStr(formatBrl(hourPrice)); }}
                    placeholder="Ex: 850,00"
                    className={inputCls}
                  />
                </div>
              </div>

              {hourNum > 0 && hourPrice > 0 && (
                <div className="rounded-lg border border-sky-700/40 bg-sky-900/20 px-4 py-3">
                  <p className="text-xs text-slate-400">Total estimado</p>
                  <p className="text-xl font-bold text-sky-300">
                    {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                </div>
              )}

              {/* Produtos */}
              {!loadingProducts && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Produtos inclusos</p>
                  {products.length === 0 ? (
                    <p className="text-xs text-slate-600">Nenhum produto ativo cadastrado.</p>
                  ) : (
                    <div className="space-y-1">
                      {products.map((p) => (
                        <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-800/60 transition">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.has(p.id)}
                            onChange={() => toggleProduct(p.id)}
                            className="h-4 w-4 rounded border-slate-600 accent-sky-500"
                          />
                          <span className="flex-1 text-sm text-slate-300">{p.name}</span>
                          <span className="text-xs text-slate-500">{p.idealPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition"
          >
            {createdProposal ? "Fechar" : "Cancelar"}
          </button>
          {!createdProposal && (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving || hourNum <= 0 || hourPrice <= 0}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition"
            >
              {saving ? "Gerando..." : "Gerar proposta"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
