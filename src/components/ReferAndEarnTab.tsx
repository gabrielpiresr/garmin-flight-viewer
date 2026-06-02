import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getMyReferrals, getReferAndEarnPublic, programConfigForRole, referralLinkForUser } from "../lib/referAndEarnDb";
import { renderRichContent } from "../lib/maneuverContent";
import { hasRichTextContent, normalizeReferralProgram } from "../lib/richContentFields";
import type { MyReferralItem, ReferralProgramConfig } from "../types/referAndEarn";
import { CRM_STATUS_LABELS, type CrmStatus } from "../types/crm";
import { Skeleton } from "./ui/Skeleton";
import { useToast } from "./ui/ToastProvider";

type ReferAndEarnTabProps = {
  portalRole: "aluno" | "instrutor";
};

function ProgressBar({ flownHours, requiredHours, progressPct }: Pick<MyReferralItem, "flownHours" | "requiredHours" | "progressPct">) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>Horas voadas</span>
        <span>
          {flownHours.toFixed(1)} / {requiredHours} h
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-500 transition-all"
          style={{ width: `${Math.min(100, progressPct)}%` }}
        />
      </div>
    </div>
  );
}

export function ReferAndEarnTab({ portalRole }: ReferAndEarnTabProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [programConfig, setProgramConfig] = useState<ReferralProgramConfig | null>(null);
  const [referrals, setReferrals] = useState<MyReferralItem[]>([]);

  const referralLink = useMemo(() => (user ? referralLinkForUser(user.id) : ""), [user]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [publicConfig, mine] = await Promise.all([getReferAndEarnPublic(), getMyReferrals()]);
      setProgramConfig(normalizeReferralProgram(programConfigForRole(publicConfig.referAndEarn, portalRole)));
      setReferrals(mine.referrals);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [portalRole, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCopyLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      showToast({ variant: "success", message: "Link copiado!" });
    } catch {
      showToast({ variant: "error", message: "Não foi possível copiar o link." });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!programConfig?.active) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center">
        <p className="text-slate-300">O programa Indique e ganhe não está ativo no momento.</p>
      </div>
    );
  }

  const showRules = hasRichTextContent(programConfig.rulesJson);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-sky-950/40 to-slate-900/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Indique e ganhe</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-50">
              {programConfig.prize.trim() || "Indique amigos e ganhe recompensas"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Compartilhe seu link. Quando seu indicado voar {programConfig.requiredHours} horas, você conquista o prêmio.
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">Ativo</span>
        </div>
      </div>

      {showRules ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Regras</h2>
          <div className="maneuver-article-content space-y-2 text-sm text-slate-300">
            {renderRichContent(programConfig.rulesJson)}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">Seu link de indicação</h2>
        <p className="mb-3 text-sm text-slate-400">Envie este link para quem você quer indicar.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            readOnly
            value={referralLink}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-200"
          />
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Copiar link
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">Suas indicações</h2>
        {referrals.length === 0 ? (
          <p className="text-sm text-slate-400">Você ainda não indicou ninguém. Compartilhe seu link!</p>
        ) : (
          <ul className="space-y-4">
            {referrals.map((item) => {
              const statusLabel = CRM_STATUS_LABELS[item.crmStatus as CrmStatus] ?? item.crmStatus;
              return (
                <li key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-100">{item.name || item.email}</p>
                      <p className="text-xs text-slate-500">{item.email}</p>
                    </div>
                    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{statusLabel}</span>
                  </div>
                  <ProgressBar
                    flownHours={item.flownHours}
                    requiredHours={item.requiredHours}
                    progressPct={item.progressPct}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
