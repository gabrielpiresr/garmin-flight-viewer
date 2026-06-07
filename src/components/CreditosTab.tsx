import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getStudentCreditStatement } from "../lib/creditsDb";
import type { StudentCreditStatement } from "../types/credits";
import { ADMIN_USERS_FUNCTION_ID } from "../lib/appwrite";
import { importSelfCreditsFromSaga } from "../lib/sagaImportDb";
import { CreditStatementView } from "./CreditStatementView";
import { Skeleton } from "./ui/Skeleton";
import { useToast } from "./ui/ToastProvider";
import {
  createFlightCreditCheckout,
  getAvailableFlightCreditPackages,
} from "../lib/flightCreditSalesDb";
import type { FlightCreditSalesConfig } from "../types/flightCreditSales";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function renderCheckoutLoading(target: Window) {
  target.document.open();
  target.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Preparando pagamento</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #020617;
        color: #e2e8f0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { max-width: 420px; padding: 32px; text-align: center; }
      .spinner {
        width: 52px;
        height: 52px;
        margin: 0 auto 24px;
        border: 4px solid #1e293b;
        border-top-color: #10b981;
        border-radius: 999px;
        animation: spin .8s linear infinite;
      }
      h1 { margin: 0; font-size: 22px; }
      p { margin: 12px 0 0; color: #94a3b8; line-height: 1.6; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <main>
      <div class="spinner" aria-hidden="true"></div>
      <h1>Preparando seu pagamento</h1>
      <p>Aguarde alguns segundos. Voce sera direcionado automaticamente para o checkout seguro.</p>
    </main>
  </body>
</html>`);
  target.document.close();
}

export function CreditosTab() {
  const { user, configured } = useAuth();
  const { showToast } = useToast();
  const [statement, setStatement] = useState<StudentCreditStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sagaImporting, setSagaImporting] = useState(false);
  const [packageConfig, setPackageConfig] = useState<FlightCreditSalesConfig | null>(null);
  const [checkoutPackageId, setCheckoutPackageId] = useState<string | null>(null);
  const [packageModalOpen, setPackageModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user || !configured) {
      setStatement(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const config = await getAvailableFlightCreditPackages().catch(() => null);
      setPackageConfig(config);
      const next = await getStudentCreditStatement({
        viewer: { userId: user.id, role: user.role },
        studentUserId: user.id,
        nightHoursDifferentFromDay: config?.nightHoursDifferentFromDay !== false,
      });
      setStatement(next);
    } catch (e) {
      setError((e as Error).message);
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [configured, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSagaSync() {
    if (sagaImporting) return;
    setSagaImporting(true);
    try {
      const summary = await importSelfCreditsFromSaga();
      const novos = (summary.creditsCreated ?? 0) + (summary.creditsUpdated ?? 0);
      showToast({
        message:
          novos > 0
            ? `${summary.creditsCreated} crédito(s) novo(s) e ${summary.creditsUpdated} atualizado(s) importados do SAGA.`
            : "Nenhum crédito novo encontrado no SAGA.",
        variant: novos > 0 ? "success" : "info",
      });
      await load();
    } catch (e) {
      showToast({ message: (e as Error).message, variant: "error" });
    } finally {
      setSagaImporting(false);
    }
  }

  const showSagaButton = !!ADMIN_USERS_FUNCTION_ID && !!user;

  async function handleBuyPackage(packageId: string) {
    if (checkoutPackageId) return;
    const checkoutWindow = window.open("about:blank", "_blank");
    if (checkoutWindow) {
      renderCheckoutLoading(checkoutWindow);
      checkoutWindow.opener = null;
    }
    setCheckoutPackageId(packageId);
    try {
      const checkout = await createFlightCreditCheckout(packageId);
      if (checkoutWindow) {
        checkoutWindow.location.href = checkout.paymentUrl;
      } else {
        window.open(checkout.paymentUrl, "_blank", "noopener,noreferrer");
      }
      showToast({ variant: "success", message: "Checkout criado. Conclua o pagamento na nova aba." });
    } catch (error) {
      checkoutWindow?.close();
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setCheckoutPackageId(null);
    }
  }

  if (loading) {
    return (
      <section className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-52 rounded-xl" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
        <p className="text-sm text-red-400">{error}</p>
      </section>
    );
  }

  if (!statement) {
    return (
      <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
        <p className="text-sm text-slate-500">Créditos indisponíveis no momento.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        {packageConfig?.studentPurchasesEnabled && packageConfig.packages.length > 0 ? (
          <button
            type="button"
            onClick={() => setPackageModalOpen(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Comprar horas
          </button>
        ) : null}
        {showSagaButton && (
          <button
            onClick={() => void handleSagaSync()}
            disabled={sagaImporting}
            className="flex items-center gap-2 rounded-lg border border-sky-700/50 bg-sky-900/30 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-800/40 disabled:opacity-50"
          >
            {sagaImporting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Sincronizando…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v-2a8 8 0 018-8 8 8 0 017.32 4.74" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20 12v2a8 8 0 01-8 8 8 8 0 01-7.32-4.74" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20 4v4h-4M4 20v-4h4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Atualizar do SAGA
              </>
            )}
          </button>
        )}
      </div>
      <CreditStatementView
        statement={statement}
        showHeading={false}
        description="Saldo por modelo de avião, compras realizadas e horas consumidas pelos voos executados."
      />
      {packageModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-emerald-700/40 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Comprar horas de voo</p>
                <p className="mt-1 text-sm text-slate-400">Escolha um pacote. Os creditos serao liberados apos a confirmacao do pagamento.</p>
              </div>
              <button
                type="button"
                onClick={() => setPackageModalOpen(false)}
                className="text-slate-400 transition hover:text-slate-200"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {packageConfig?.packages.map((item) => {
                const total = item.hours * item.hourPrice;
                const buying = checkoutPackageId === item.id;
                return (
                  <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{item.aircraftModelName}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">{item.hours}h</p>
                    <p className="mt-2 text-sm text-slate-400">{formatCurrency(item.hourPrice)} por hora</p>
                    <p className="text-lg font-semibold text-emerald-300">{formatCurrency(total)}</p>
                    <p className="mt-1 text-xs text-slate-500">Validade: {item.validityDays} dias apos o pagamento</p>
                    <button
                      type="button"
                      onClick={() => void handleBuyPackage(item.id)}
                      disabled={checkoutPackageId !== null}
                      className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {buying ? "Criando checkout..." : "Comprar pacote"}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
