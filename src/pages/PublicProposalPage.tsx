import { useEffect, useState } from "react";
import { getProposalByToken } from "../lib/crmProposalsDb";
import { getProposalConfig, getProposalImageUrl } from "../lib/proposalSettingsDb";
import { richContentToHtml } from "../lib/maneuverContent";
import type { CrmProposal, ProposalConfig, ProposalSection } from "../types/proposal";
import { youtubeEmbedUrl } from "../types/proposal";
import type { ManeuverRichContent } from "../types/maneuver";

function tokenFromPath(): string {
  const parts = window.location.pathname.split("/");
  return parts[parts.length - 1] ?? "";
}

function fmtCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function applyBranding(config: ProposalConfig) {
  if (config.fontFamily) {
    const id = "proposal-font";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id; link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(config.fontFamily)}:wght@300;400;500;600;700&display=swap`;
      document.head.appendChild(link);
    }
    document.body.style.fontFamily = `'${config.fontFamily}', system-ui, sans-serif`;
  }
  if (config.schoolName) document.title = `Proposta — ${config.schoolName}`;
}

function sectionIsVisible(sec: ProposalSection, proposal: CrmProposal): boolean {
  if (!sec.triggerProductKeyword) return true;
  const kw = sec.triggerProductKeyword.toLowerCase();
  return proposal.products.some((p) => p.name.toLowerCase().includes(kw));
}

export function PublicProposalPage() {
  const token = tokenFromPath();
  const [proposal, setProposal] = useState<CrmProposal | null>(null);
  const [config, setConfig] = useState<ProposalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Proposta não encontrada."); setLoading(false); return; }
    Promise.all([getProposalByToken(token), getProposalConfig()]).then(([proposalRes, configRes]) => {
      if (proposalRes.error || !proposalRes.data) {
        setError("Proposta não encontrada ou link inválido.");
      } else {
        setProposal(proposalRes.data);
      }
      if (configRes) { setConfig(configRes); applyBranding(configRes); }
    }).catch(() => setError("Erro ao carregar a proposta."))
      .finally(() => setLoading(false));
  }, [token]);

  const primary = config?.primaryColor ?? "#10b981";
  const accent  = config?.accentColor  ?? "#38bdf8";
  const logo    = config?.logoUrl      ?? "";
  const school  = config?.schoolName   ?? "Escola de Aviação";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <h1 className="text-xl font-bold text-slate-700">Proposta não encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">{error ?? "Este link pode ter expirado ou é inválido."}</p>
      </div>
    );
  }

  const paymentHtml  = config?.paymentMethodsRichJson  ? richContentToHtml(config.paymentMethodsRichJson  as ManeuverRichContent) : "";
  const additionalHtml = config?.additionalInfoRichJson ? richContentToHtml(config.additionalInfoRichJson as ManeuverRichContent) : "";

  const visibleSections = (config?.sections ?? []).filter((s) => sectionIsVisible(s, proposal));

  return (
    <div style={{ fontFamily: config?.fontFamily ? `'${config.fontFamily}', system-ui, sans-serif` : "system-ui, sans-serif" }}
      className="min-h-screen bg-gray-50">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header style={{ borderBottomColor: primary }} className="bg-white border-b-4 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-5 px-6 py-5">
          {logo && <img src={logo} alt={school} className="h-14 max-w-[160px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          <div>
            <h1 style={{ color: primary }} className="text-xl font-bold">{school}</h1>
            <p className="text-xs text-slate-500">Proposta comercial · {fmtDate(proposal.createdAt)}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 space-y-14">

        {/* ── 1. Saudação ──────────────────────────────────────────────────────── */}
        <section className="text-center py-4">
          <p style={{ color: primary }} className="text-xs font-semibold uppercase tracking-widest mb-2">{school}</p>
          <h2 className="text-4xl font-bold text-slate-800 mb-3">Olá, {proposal.leadName}!</h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Preparamos esta proposta exclusiva para você. Confira os diferenciais e os valores abaixo.
          </p>
        </section>

        {/* ── 2. Vídeo de capa ─────────────────────────────────────────────────── */}
        {config?.coverVideoUrl && youtubeEmbedUrl(config.coverVideoUrl) && (
          <section>
            <div className="overflow-hidden rounded-2xl shadow-lg aspect-video">
              <iframe
                src={youtubeEmbedUrl(config.coverVideoUrl)!}
                title="Vídeo de apresentação"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </section>
        )}

        {/* ── 3. Diferenciais (antes da proposta) ─────────────────────────────── */}
        {config && config.differentials.length > 0 && (
          <section>
            <div className="mb-8 text-center">
              <h3 className="text-2xl font-bold text-slate-800">Por que escolher nossa escola?</h3>
              <div style={{ backgroundColor: primary }} className="mx-auto mt-3 h-1 w-16 rounded-full" />
            </div>
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
              {config.differentials.map((d) => (
                <div key={d.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {d.imageFileId && (
                    <div className="aspect-video overflow-hidden">
                      <img src={getProposalImageUrl(d.imageFileId)} alt={d.title} className="h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = "none"; }} />
                    </div>
                  )}
                  <div className="p-5">
                    <div style={{ backgroundColor: `${primary}18` }} className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg">
                      <svg style={{ color: primary }} className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h4 className="font-bold text-slate-800 mb-2">{d.title}</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">{d.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 4. Seções personalizadas ──────────────────────────────────────────── */}
        {visibleSections.map((sec) => {
          const embedUrl = youtubeEmbedUrl(sec.videoUrl ?? "");
          return (
            <section key={sec.id}>
              <div className="mb-6">
                <h3 style={{ borderBottomColor: primary }} className="text-2xl font-bold text-slate-800 pb-3 border-b-2 inline-block pr-8">
                  {sec.title}
                </h3>
              </div>

              {/* Vídeo do YouTube */}
              {embedUrl && (
                <div className="mb-6 overflow-hidden rounded-2xl shadow-md aspect-video">
                  <iframe src={embedUrl} title={sec.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen className="h-full w-full" />
                </div>
              )}

              {/* Imagens + descrição */}
              {sec.imageIds.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className={`grid gap-2 ${sec.imageIds.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                    {sec.imageIds.map((imgId, i) => (
                      <div key={`${imgId}-${i}`} className={`overflow-hidden rounded-xl border border-slate-200 shadow-sm ${sec.imageIds.length === 1 ? "aspect-video" : "aspect-square"}`}>
                        <img src={getProposalImageUrl(imgId)} alt={`${sec.title} ${i + 1}`} className="h-full w-full object-cover"
                          onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = "none"; }} />
                      </div>
                    ))}
                  </div>
                  {sec.description && (
                    <div className="flex items-center">
                      <p className="text-slate-600 leading-relaxed whitespace-pre-line text-base">{sec.description}</p>
                    </div>
                  )}
                </div>
              ) : (
                sec.description && (
                  <p className="text-slate-600 leading-relaxed whitespace-pre-line text-base">{sec.description}</p>
                )
              )}
            </section>
          );
        })}

        {/* ── 5. Sua proposta ──────────────────────────────────────────────────── */}
        {(() => {
          const itemsSum = proposal.products.reduce((s, p) => s + p.price, 0);
          const grandTotal = proposal.totalValue + itemsSum;
          return (
            <section style={{ background: `linear-gradient(135deg, ${primary}10 0%, ${accent}10 100%)`, borderColor: `${primary}35` }}
              className="rounded-2xl border p-8">
              <h3 className="text-xl font-bold text-slate-800 mb-6">Sua proposta</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: `${primary}12` }}>
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Item</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="px-4 py-3 text-slate-700">
                        Horas de voo
                        <span className="ml-2 text-xs text-slate-400">({proposal.hours}h × {fmtCurrency(proposal.hourPrice)}/h)</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmtCurrency(proposal.totalValue)}</td>
                    </tr>
                    {proposal.products.map((p, i) => (
                      <tr key={p.id} className={(i + 1) % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                        <td className="px-4 py-3 text-slate-700">{p.name}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{fmtCurrency(p.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: `${primary}18` }}>
                      <td className="px-4 py-3 font-bold text-slate-800">Total</td>
                      <td style={{ color: primary }} className="px-4 py-3 text-right text-lg font-bold">{fmtCurrency(grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          );
        })()}

        {/* ── 6. Formas de pagamento ────────────────────────────────────────────── */}
        {paymentHtml && (
          <section>
            <h3 style={{ borderBottomColor: primary }} className="mb-5 pb-3 text-xl font-bold text-slate-800 border-b-2">
              Formas de pagamento
            </h3>
            {/* eslint-disable-next-line react/no-danger */}
            <div className="prose prose-slate max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: paymentHtml }} />
          </section>
        )}

        {/* ── 7. Informações adicionais ─────────────────────────────────────────── */}
        {additionalHtml && (
          <section>
            <h3 style={{ borderBottomColor: primary }} className="mb-5 pb-3 text-xl font-bold text-slate-800 border-b-2">
              Informações adicionais
            </h3>
            {/* eslint-disable-next-line react/no-danger */}
            <div className="prose prose-slate max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: additionalHtml }} />
          </section>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────────── */}
        <footer className="border-t border-slate-200 pt-8 text-center">
          <p className="text-sm text-slate-500">{school} · Proposta gerada em {new Date().toLocaleDateString("pt-BR")}</p>
          <p className="mt-1 text-xs text-slate-400">Documento confidencial destinado exclusivamente a {proposal.leadName}.</p>
        </footer>
      </div>
    </div>
  );
}
