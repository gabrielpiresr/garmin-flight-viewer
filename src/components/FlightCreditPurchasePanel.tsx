import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FlightCreditCheckoutExtraProduct, FlightCreditSalesConfig } from "../types/flightCreditSales";
import {
  effectiveHourPrice,
  formatHoursLabel,
  formatPurchaseCurrency,
  isWeekdayDiscountEligible,
  packageReferenceForCustomHours,
  type CreditAvailability,
} from "../lib/flightCreditPurchase";

type Props = {
  config: FlightCreditSalesConfig;
  onCheckout: (
    packageId: string,
    customHours?: number,
    weekdayOnly?: boolean,
    extraProducts?: FlightCreditCheckoutExtraProduct[],
  ) => Promise<void>;
  checkoutBusy?: boolean;
  extraProducts?: FlightCreditCheckoutExtraProduct[];
  extraProductsContent?: ReactNode;
};

export function FlightCreditPurchasePanel({
  config,
  onCheckout,
  checkoutBusy = false,
  extraProducts = [],
  extraProductsContent,
}: Props) {
  const [availability, setAvailability] = useState<CreditAvailability>("any");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<"package" | "custom">("package");
  const [customExpanded, setCustomExpanded] = useState(false);
  const [customHoursInput, setCustomHoursInput] = useState("");
  const [weekdayAcknowledged, setWeekdayAcknowledged] = useState(false);

  const discountPct = config.weekdayDiscountPct ?? null;
  const globalWeekdayDiscount = discountPct != null && discountPct > 0 && discountPct < 100;
  const weekdayEligiblePackages = useMemo(
    () => config.packages.filter(isWeekdayDiscountEligible),
    [config.packages],
  );
  const hasWeekdayDiscount = globalWeekdayDiscount && weekdayEligiblePackages.length > 0;
  const weekdayDiscountLabel = globalWeekdayDiscount ? Math.round(discountPct!) : 10;

  const aircraftOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const pkg of config.packages) {
      map.set(pkg.aircraftModelId, pkg.aircraftModelName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [config.packages]);

  const modelPackages = useMemo(
    () =>
      [...config.packages]
        .filter((pkg) => !selectedModelId || pkg.aircraftModelId === selectedModelId)
        .filter((pkg) => availability !== "weekday" || isWeekdayDiscountEligible(pkg))
        .sort((a, b) => a.hours - b.hours),
    [config.packages, selectedModelId, availability],
  );

  const hourPriceFor = (pkg: (typeof config.packages)[number]) =>
    effectiveHourPrice(pkg.hourPrice, availability, discountPct, isWeekdayDiscountEligible(pkg));

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
    const firstModel = aircraftOptions[0]?.id ?? "";
    setSelectedModelId(firstModel);
    setAvailability("any");
    setSelectionMode("package");
    setCustomExpanded(false);
    setCustomHoursInput("");
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
    if (!hasWeekdayDiscount && availability === "weekday") {
      setAvailability("any");
    }
  }, [hasWeekdayDiscount, availability]);

  useEffect(() => {
    if (availability !== "weekday" || !selectedModelId) return;
    const allForModel = config.packages.filter((pkg) => pkg.aircraftModelId === selectedModelId);
    const eligibleForModel = allForModel.filter(isWeekdayDiscountEligible);
    if (allForModel.length > 0 && eligibleForModel.length === 0) {
      setAvailability("any");
    }
  }, [config.packages, availability, selectedModelId]);

  useEffect(() => {
    if (availability !== "weekday") {
      setWeekdayAcknowledged(false);
    }
  }, [availability]);

  const requiresWeekdayAck = availability === "weekday" && hasWeekdayDiscount;
  const availabilityLabel = availability === "weekday" ? "Segunda a sexta-feira" : "Qualquer dia";
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
  const extrasTotal = useMemo(
    () => Number(extraProducts.reduce((sum, item) => sum + (Number(item.price) || 0), 0).toFixed(2)),
    [extraProducts],
  );
  const checkoutTotal = summaryTotal != null ? Number((summaryTotal + extrasTotal).toFixed(2)) : null;
  const customPurchaseReady =
    isCustomPurchase && customHours >= 0.5 && customReference != null && customTotal != null;
  const packagePurchaseReady = !isCustomPurchase && selectedPackage != null && summaryTotal != null;
  const canCheckout = customPurchaseReady || packagePurchaseReady;
  const checkoutPackageId = isCustomPurchase ? customReference?.id : selectedPackage?.id;
  const buying = checkoutBusy;

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
    <div className="space-y-6">
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
                Receba desconto nos pacotes elegíveis. Esses créditos só poderão ser usados em voos de segunda a
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

      {extraProductsContent ? <section>{extraProductsContent}</section> : null}

      <section className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
        <p className="text-sm font-semibold text-slate-200">Resumo da compra</p>
        {summaryPackage && checkoutTotal != null && summaryHourPrice != null ? (
          <>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p className="font-medium text-slate-100">{formatHoursLabel(summaryHours)} de voo</p>
              <p>
                <span className="text-slate-500">Aeronave:</span> {summaryPackage.aircraftModelName}
              </p>
              <p>
                <span className="text-slate-500">Uso dos créditos:</span> {availabilityLabel}
              </p>
              {availability === "weekday" && hasWeekdayDiscount && isWeekdayDiscountEligible(summaryPackage) ? (
                <p>
                  <span className="text-slate-500">Desconto aplicado:</span> {weekdayDiscountLabel}%
                </p>
              ) : null}
              <p>
                <span className="text-slate-500">Validade:</span> {summaryPackage.validityDays} dia
                {summaryPackage.validityDays === 1 ? "" : "s"}
              </p>
              <p className="text-slate-400">{formatPurchaseCurrency(summaryHourPrice)} por hora</p>
              {extraProducts.length > 0 ? (
                <div className="space-y-1 border-t border-slate-800 pt-2">
                  {extraProducts.map((product) => (
                    <p key={product.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-slate-400">+ {product.name}</span>
                      <span className="shrink-0 text-slate-200">{formatPurchaseCurrency(product.price)}</span>
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-slate-800 pt-4">
              <span className="text-sm text-slate-400">Total</span>
              <span className="text-2xl font-semibold text-emerald-300">{formatPurchaseCurrency(checkoutTotal)}</span>
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
              void onCheckout(
                checkoutPackageId,
                isCustomPurchase ? customHours : undefined,
                availability === "weekday",
                extraProducts,
              );
            }}
            disabled={checkoutBusy || !canCheckout || (requiresWeekdayAck && !weekdayAcknowledged)}
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {buying ? "Preparando pagamento…" : "Comprar agora"}
          </button>
        ) : null}
      </section>
    </div>
  );
}
