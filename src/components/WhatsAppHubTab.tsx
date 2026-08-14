import { useCallback, useEffect, useState } from "react";
import { getWppHub, stopMyMetarWatch } from "../lib/wppDb";
import type { WppHub } from "../types/wpp";
import { useToast } from "./ui/ToastProvider";

function formatWatchUntil(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDisplayPhone(value: string | null): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "número ainda não configurado";
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const split = rest.length === 9 ? [rest.slice(0, 5), rest.slice(5)] : [rest.slice(0, 4), rest.slice(4)];
    return `+55 (${ddd}) ${split.filter(Boolean).join("-")}`;
  }
  return `+${digits}`;
}

export function WhatsAppHubTab() {
  const { showToast } = useToast();
  const [hub, setHub] = useState<WppHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [stoppingIcao, setStoppingIcao] = useState("");

  const loadHub = useCallback(async () => {
    const next = await getWppHub();
    setHub(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadHub()
      .catch((error) => {
        if (!cancelled) {
          showToast({
            variant: "error",
            message: error instanceof Error ? error.message : "Não foi possível carregar o WhatsApp.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadHub, showToast]);

  async function handleStop(icao: string) {
    setStoppingIcao(icao);
    try {
      const watches = await stopMyMetarWatch(icao);
      setHub((current) => (current ? { ...current, watches } : current));
      showToast({ variant: "success", message: `Acompanhamento de ${icao} encerrado.` });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Não foi possível parar o alerta.",
      });
    } finally {
      setStoppingIcao("");
    }
  }

  if (loading && !hub) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40" />
        <div className="h-56 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40" />
      </div>
    );
  }

  const trial = hub?.trial;
  const showTrial = Boolean(trial && !trial.unlimited);
  const ctaDisabled = !hub?.waMeUrl;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-slate-900/80 to-slate-950 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Número de avisos</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-50">WhatsApp da escola</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Chame o número de avisos para pedir METAR, detalhes do aeródromo, NOTAMs e acompanhar mudanças no tempo.
          {hub?.displayPhoneNumber ? ` O bot atende em ${formatDisplayPhone(hub.displayPhoneNumber)}.` : ""}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {ctaDisabled ? (
            <span className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-slate-500">
              WhatsApp ainda não conectado
            </span>
          ) : (
            <a
              href={hub?.waMeUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Conversar no WhatsApp
            </a>
          )}
          {hub?.businessName ? (
            <span className="text-xs text-slate-500">{hub.businessName}</span>
          ) : null}
        </div>
      </section>

      {showTrial ? (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <h2 className="text-sm font-semibold text-amber-100">Trial de METAR</h2>
          {!trial?.hasPhone ? (
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Cadastre seu telefone no perfil para casarmos os alertas deste WhatsApp com a sua conta.
            </p>
          ) : trial.expired ? (
            <div className="mt-2 space-y-3">
              <p className="text-sm leading-6 text-slate-300">
                Seu trial de 10 mensagens expirou. Assine o Flight Review Club para continuar recebendo METAR, TAF e
                detalhes de aeródromo pelo WhatsApp.
              </p>
              {trial.subscribeUrl ? (
                <a
                  href={trial.subscribeUrl}
                  className="inline-flex rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
                >
                  Assinar o Flight Review Club
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Você ainda pode receber <strong className="text-amber-100">{trial?.remaining ?? 0}</strong> de{" "}
              {trial?.limit ?? 10} mensagens de METAR/detalhes neste trial.
              {trial?.subscribeUrl ? (
                <>
                  {" "}
                  Assinantes do{" "}
                  <a href={trial.subscribeUrl} className="font-semibold text-amber-200 underline decoration-amber-200/40">
                    Flight Review Club
                  </a>{" "}
                  usam sem limite.
                </>
              ) : null}
            </p>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-slate-100">O que você pode pedir</h2>
        <p className="mt-1 text-sm text-slate-500">Envie o comando exatamente como nos exemplos, ou use os botões que o bot responder.</p>
        <ul className="mt-4 divide-y divide-slate-800">
          {(hub?.commands || []).map((command) => (
            <li key={command.example} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-semibold text-slate-200">{command.title}</p>
              <p className="mt-1 font-mono text-xs text-emerald-300/90">{command.example}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">{command.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Alertas de METAR</h2>
            <p className="mt-1 text-sm text-slate-500">Acompanhamentos ativos neste WhatsApp. Você pode parar qualquer um por aqui.</p>
          </div>
        </div>
        {!trial?.hasPhone ? (
          <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-slate-400">
            Sem telefone no perfil não dá para listar os alertas. Atualize o cadastro e recarregue esta página.
          </p>
        ) : !(hub?.watches || []).length ? (
          <p className="mt-4 text-sm text-slate-500">Nenhum acompanhamento ativo. No WhatsApp, envie <span className="font-mono text-slate-300">Acompanhar SBSP</span>.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {hub?.watches.map((watch) => (
              <li
                key={watch.icao}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-slate-100">{watch.icao}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {watch.hours}h · até {formatWatchUntil(watch.expiresAt)}
                    {watch.simplified ? " · simplificado" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={stoppingIcao === watch.icao}
                  onClick={() => void handleStop(watch.icao)}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                >
                  {stoppingIcao === watch.icao ? "Parando..." : "Parar alerta"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
