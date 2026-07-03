import { useEffect, useMemo, useState } from "react";
import type { FlightCreditPackage, FlightCreditSalesConfig } from "../types/flightCreditSales";
import { createFlightCreditCheckout, getAvailableFlightCreditPackages } from "../lib/flightCreditSalesDb";
import {
  effectiveHourPrice,
  formatHoursLabel,
  formatPurchaseCurrency,
  packageReferenceForCustomHours,
  renderCheckoutLoading,
  type CreditAvailability,
} from "../lib/flightCreditPurchase";
import { navigateToTab } from "../lib/routedTabs";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/ToastProvider";

export function FlightCreditPurchasePage() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<FlightCreditSalesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<CreditAvailability>("any");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<"package" | "custom">("package");
  const [customExpanded, setCustomExpanded] = useState(false);
  const [customHoursInput, setCustomHoursInput] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [weekdayAcknowledged, setWeekdayAcknowledged] = useState(false);

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

  const discountPct = config?.weekdayDiscountPct ?? null;
  const hasWeekdayDiscount = discountPct != null && discountPct > 0 && discountPct < 100;
  const weekdayDiscountLabel = hasWeekdayDiscount ? Math.round(discountPct) : 10;

  const aircraftOptions = useMemo(() => {
    if (!config) return [];
    const map = new Map<string, string>();
    for (const pkg of config.packages) {
      map.set(pkg.aircraftModelId, pkg.aircraftModelName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [config]);

  const modelPackages = useMemo(
    () =>
      config
        ? [...config.packages]
            .filter((pkg) => !selectedModelId || pkg.aircraftModelId === selectedModelId)
            .sort((a, b) => a.hours - b.hours)
        : [],
    [config, selectedModelId],
  );

  const hourPriceFor = (pkg: FlightCreditPackage) =>
    effectiveHourPrice(pkg.hourPrice, availability, discountPct);

  const selectedPackage = modelPackages.find((pkg) => pkg.id === selectedPackageId) ?? null;

  const parsedCustomHours = Number(customHoursInput.replace(",", "."));
  const customHours = Number.isFinite(parsedCustomHours) ? Math.round(parsedCustomHours * 100) / 100 : 0;
  const customReference = packageReferenceForCustomHours(modelPackages, customHours);
  const customHourPrice = customReference != null ? hourPriceFor(customReference) : null;
  const customTotal =
    customReference && customHours > 0 && customHourPrice != null
      ? Number((customHours * customHourPrice).toFixed(2))
      : null;

  useEffect(() => {
    if (!config) return;
    const firstModel = aircraftOptions[0]?.id ?? "";
    setSelectedModelId(firstModel);
    setAvailability("any");
    setSelectionMode("package");
    setCustomExpanded(false);
    setCustomHoursInput("");
    setCheckoutBusy(null);
  }, [config, aircraftOptions]);

  useEffect(() => {
    if (modelPackages.length === 0) {
      setSelectedPackageId(null);
      return;
    }
    if (selectionMode === "custom") return;
    setSelectedPackageId((current) =>
      current && modelPackages.some((pkg) => pkg.id === current) ? current : modelPackages[0].id,
    );
  }, [modelPackages, selectionMode]);

  useEffect(() => {
    if (availability !== "weekday") {
      setWeekdayAcknowledged(false);
    }
  }, [availability]);

  const requiresWeekdayAck = availability === "weekday" && hasWeekdayDiscount;

  async function startCheckout(packageId: string, customHoursValue?: number) {
    if (checkoutBusy) return;
    const checkoutWindow = window.open("about:blank", "_blank");
    if (checkoutWindow) {
      renderCheckoutLoading(checkoutWindow);
      checkoutWindow.opener = null;
    }
    const busyKey = customHoursValue != null ? `custom:${packageId}` : packageId;
    setCheckoutBusy(busyKey);
    try {
      const checkout = await createFlightCreditCheckout(
        packageId,
        customHoursValue,
        availability === "weekday",
      );
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
      setCheckoutBusy(null);
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

  const availabilityLabel =
    availability === "weekday" ? "Segunda a sexta-feira" : "Qualquer dia";
  const isCustomPurchase = selectionMode === "custom";
  const summaryPackage = isCustomPurchase ? customReference : selectedPackage;
  const summaryHours = isCustomPurchase ? customHours : selectedPackage?.hours ?? 0;
  const summaryHourPrice =
    summaryPackage != null
      ? isCustomPurchase
        ? customHourPrice
        : hourPriceFor(summaryPackage)
      : null;
  const summaryTotal =
    summaryPackage && summaryHourPrice != null
      ? Number((summaryHours * summaryHourPrice).toFixed(2))
      : null;
  const customPurchaseReady =
    isCustomPurchase && customHours >= 0.5 && customReference != null && customTotal != null;
  const packagePurchaseReady = !isCustomPurchase && selectedPackage != null && summaryTotal != null;
  const canCheckout = customPurchaseReady || packagePurchaseReady;
  const checkoutPackageId = isCustomPurchase ? customReference?.id : selectedPackage?.id;
  const checkoutBusyKey =
    checkoutPackageId == null
      ? null
      : isCustomPurchase
        ? `custom:${checkoutPackageId}`
        : checkoutPackageId;
  const buying = checkoutBusy != null && checkoutBusy === checkoutBusyKey;

  function selectPackage(packageId: string) {
    setSelectionMode("package");
    setSelectedPackageId(packageId);
    setCustomExpanded(false);
    setCustomHoursInput("");
  }

  function openCustomPurchase() {
    setSelectionMode("custom");
    setSelectedPackageId(null);
    setCustomExpanded(true);
  }

  function closeCustomPurchase() {
    setCustomExpanded(false);
    setCustomHoursInput("");
    setSelectionMode("package");
    if (modelPackages.length > 0) {
      setSelectedPackageId(modelPackages[0].id);
    }
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

      {aircraftOptions.length > 1 ? (
        <section>
          <p className="mb-2 text-sm font-medium text-slate-200">Aeronave</p>
          <div className="flex flex-wrap gap-2">
            {aircraftOptions.map((option) => {
              const active = option.id === selectedModelId;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedModelId(option.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                      : "border-slate-700 bg-slate-950/40 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  {option.name}
                </button>
              );
            })}
          </div>
        </section>
      ) : aircraftOptions.length === 1 ? (
        <section>
          <p className="mb-1 text-sm font-medium text-slate-200">Aeronave</p>
          <p className="text-sm text-slate-300">{aircraftOptions[0].name}</p>
        </section>
      ) : null}

      {hasWeekdayDiscount ? (
        <section>
          <p className="mb-3 text-sm font-medium text-slate-200">Disponibilidade dos créditos</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setAvailability("any")}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                availability === "any"
                  ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                  : "border-slate-700/80 bg-slate-950/30 hover:border-slate-600"
              }`}
            >
              <p className="text-sm font-semibold text-slate-100">Qualquer dia</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Use seus créditos em voos de segunda a domingo.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setAvailability("weekday")}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                availability === "weekday"
                  ? "border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30"
                  : "border-slate-700/80 bg-slate-950/30 hover:border-slate-600"
              }`}
            >
              <p className="text-sm font-semibold text-slate-100">
                Segunda a sexta — {weekdayDiscountLabel}% off
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Receba desconto em qualquer pacote. Esses créditos só poderão ser usados em voos de segunda a
                sexta-feira.
              </p>
            </button>
          </div>
        </section>
      ) : null}

      <section>
        <p className="mb-3 text-sm font-medium text-slate-200">Escolha seu pacote</p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {modelPackages.map((pkg) => {
            const hourPrice = hourPriceFor(pkg);
            const total = Number((pkg.hours * hourPrice).toFixed(2));
            const selected = !isCustomPurchase && pkg.id === selectedPackageId;
            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => selectPackage(pkg.id)}
                className={`flex flex-col rounded-xl border px-3 py-3 text-left transition sm:px-4 sm:py-4 ${
                  selected
                    ? "border-emerald-500/60 bg-emerald-500/10 ring-2 ring-emerald-500/40"
                    : "border-slate-700/70 bg-slate-950/30 hover:border-slate-600"
                }`}
              >
                <span className="text-lg font-semibold text-slate-100 sm:text-xl">{pkg.hours}h</span>
                <span className="mt-2 text-base font-semibold text-emerald-300 sm:text-lg">
                  {formatPurchaseCurrency(hourPrice)}
                  <span className="text-sm font-normal text-slate-400"> /h</span>
                </span>
                <span className="mt-1 text-sm text-slate-300">{formatPurchaseCurrency(total)}</span>
                <span className="mt-2 text-xs text-slate-500">
                  Validade: {pkg.validityDays} dia{pkg.validityDays === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        {!customExpanded ? (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/20 px-4 py-3 text-center">
            <p className="text-sm text-slate-400">Precisa de outra quantidade?</p>
            <button
              type="button"
              onClick={openCustomPurchase}
              className="mt-2 text-sm font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
            >
              Calcular pacote personalizado
            </button>
          </div>
        ) : (
          <div
            className={`rounded-xl border p-4 ${
              isCustomPurchase
                ? "border-sky-500/50 bg-sky-500/5 ring-1 ring-sky-500/30"
                : "border-slate-700/60 bg-slate-950/30"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-200">Quantidade personalizada</p>
              <button
                type="button"
                onClick={closeCustomPurchase}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Fechar
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Digite a quantidade de horas que deseja comprar.</p>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Horas desejadas</span>
              <input
                type="number"
                min="0.5"
                step="0.5"
                inputMode="decimal"
                value={customHoursInput}
                onChange={(event) => setCustomHoursInput(event.target.value)}
                placeholder="Ex.: 11,5"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              />
            </label>
            {customHours > 0 && customHours < 0.5 ? (
              <p className="mt-3 text-xs text-slate-500">Informe no mínimo 0,5h para calcular o valor.</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
        <p className="text-sm font-semibold text-slate-200">Resumo da compra</p>
        {summaryPackage && summaryTotal != null && summaryHourPrice != null ? (
          <>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p className="font-medium text-slate-100">{formatHoursLabel(summaryHours)} de voo</p>
              <p>
                <span className="text-slate-500">Aeronave:</span> {summaryPackage.aircraftModelName}
              </p>
              <p>
                <span className="text-slate-500">Uso dos créditos:</span> {availabilityLabel}
              </p>
              {availability === "weekday" && hasWeekdayDiscount ? (
                <p>
                  <span className="text-slate-500">Desconto aplicado:</span> {weekdayDiscountLabel}%
                </p>
              ) : null}
              <p>
                <span className="text-slate-500">Validade:</span> {summaryPackage.validityDays} dia
                {summaryPackage.validityDays === 1 ? "" : "s"}
              </p>
              <p className="text-slate-400">{formatPurchaseCurrency(summaryHourPrice)} por hora</p>
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-slate-800 pt-4">
              <span className="text-sm text-slate-400">Total</span>
              <span className="text-2xl font-semibold text-emerald-300">{formatPurchaseCurrency(summaryTotal)}</span>
            </div>
          </>
        ) : isCustomPurchase ? (
          <p className="mt-3 text-sm text-slate-500">Informe no mínimo 0,5h para ver o resumo e concluir a compra.</p>
        ) : null}
        {requiresWeekdayAck && summaryPackage && summaryTotal != null ? (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-sky-700/40 bg-sky-950/20 p-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={weekdayAcknowledged}
              onChange={(event) => setWeekdayAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500"
            />
            <span>
              Estou ciente que os créditos só poderão ser consumidos em voos realizados de segunda a sexta
            </span>
          </label>
        ) : null}
        {summaryPackage && summaryTotal != null ? (
          <button
            type="button"
            onClick={() => {
              if (!checkoutPackageId) return;
              void startCheckout(checkoutPackageId, isCustomPurchase ? customHours : undefined);
            }}
            disabled={
              checkoutBusy !== null ||
              !canCheckout ||
              (requiresWeekdayAck && !weekdayAcknowledged)
            }
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {buying ? "Preparando pagamento…" : "Comprar agora"}
          </button>
        ) : null}
      </section>
    </div>
  );
}
