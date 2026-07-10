import { useEffect, useState } from "react";
import { createFlightCreditCheckout, getAvailableFlightCreditPackages } from "../lib/flightCreditSalesDb";
import { renderCheckoutLoading } from "../lib/flightCreditPurchase";
import { navigateToTab } from "../lib/routedTabs";
import { FlightCreditPurchasePanel } from "../components/FlightCreditPurchasePanel";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/ToastProvider";

export function FlightCreditPurchasePage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof getAvailableFlightCreditPackages>> | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void getAvailableFlightCreditPackages()
      .then((next) => {
        if (cancelled) return;
        if (!next.studentPurchasesEnabled || next.packages.length === 0) {
          setLoadError("Não há pacotes disponíveis para compra no momento.");
          setConfig(null);
          return;
        }
        setConfig(next);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setLoadError(error.message);
        setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startCheckout(packageId: string, customHours?: number, weekdayOnly?: boolean) {
    if (checkoutBusy) return;
    const checkoutWindow = window.open("about:blank", "_blank");
    if (checkoutWindow) {
      renderCheckoutLoading(checkoutWindow);
      checkoutWindow.opener = null;
    }
    setCheckoutBusy(true);
    try {
      const checkout = await createFlightCreditCheckout(packageId, customHours, weekdayOnly);
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
      setCheckoutBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (loadError || !config) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <button
          type="button"
          onClick={() => navigateToTab("/aluno/creditos")}
          className="text-sm text-slate-400 transition hover:text-slate-200"
        >
          ← Voltar para créditos
        </button>
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-300">
          {loadError ?? "Pacotes indisponíveis."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={() => navigateToTab("/aluno/creditos")}
        className="inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200"
      >
        ← Voltar para créditos
      </button>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">Comprar horas de voo</h1>
        <p className="text-sm text-slate-400">Escolha quantas horas deseja adicionar ao seu saldo.</p>
        <p className="text-xs text-slate-500">
          Após a confirmação do pagamento, os créditos ficarão disponíveis para agendamento.
        </p>
      </header>

      <FlightCreditPurchasePanel config={config} onCheckout={startCheckout} checkoutBusy={checkoutBusy} />
    </div>
  );
}
