import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getStudentCreditStatement } from "../lib/creditsDb";
import type { StudentCreditStatement } from "../types/credits";
import { ADMIN_USERS_FUNCTION_ID } from "../lib/appwrite";
import { importSelfCreditsFromSaga } from "../lib/sagaImportDb";
import { CreditStatementView } from "./CreditStatementView";
import { Skeleton } from "./ui/Skeleton";
import { useToast } from "./ui/ToastProvider";
import { getAvailableFlightCreditPackages } from "../lib/flightCreditSalesDb";
import { FLIGHT_CREDIT_PURCHASE_PATH, navigateToTab } from "../lib/routedTabs";
import type { FlightCreditSalesConfig } from "../types/flightCreditSales";

export function CreditosTab() {
  const { user, configured } = useAuth();
  const { showToast } = useToast();
  const [statement, setStatement] = useState<StudentCreditStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sagaImporting, setSagaImporting] = useState(false);
  const [packageConfig, setPackageConfig] = useState<FlightCreditSalesConfig | null>(null);

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
            onClick={() => navigateToTab(FLIGHT_CREDIT_PURCHASE_PATH)}
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
    </div>
  );
}
