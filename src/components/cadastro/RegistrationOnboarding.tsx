import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createRegistrationCheckout,
  getRegistrationCheckoutStatus,
  quoteRegistrationCheckout,
} from "../../lib/caktoDb";
import { getPublicProposalByToken } from "../../lib/crmProposalsDb";
import { getInitialRegistrationSchedule } from "../../lib/scheduleBookingDb";
import { buildMergedRegistrationSlots, formatRegistrationDayLabel } from "../../lib/registrationScheduleSlots";
import { listSchoolProducts } from "../../lib/schoolProductsDb";
import { getCachedBrandSettings, getEmailBrandSettings } from "../../lib/notificationsDb";
import type { RegistrationCheckoutProduct } from "../../types/cakto";
import type { RegistrationLinkOptions } from "../../types/instructorAdmission";
import type { EmailBrandSettings } from "../../types/notification";

export type RegistrationBookingSummary = {
  date: string;
  groundStart: string;
  groundEnd?: string;
  flightStart: string;
  aircraftIdent?: string;
  presentationTime?: string;
  cutoffTime?: string;
  endTime?: string;
};

export type OnboardingView = "checklist" | "form" | "transfer" | "contracts" | "payment" | "schedule";

export const ONBOARDING_COL_CLASS = "w-full max-w-xl";

export function onboardingViewFromPath(pathname: string): OnboardingView {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path.endsWith("/cadastro/formulario")) return "form";
  if (path.endsWith("/cadastro/transferencia")) return "transfer";
  if (path.endsWith("/cadastro/contratos")) return "contracts";
  if (path.endsWith("/cadastro/pagamento")) return "payment";
  if (path.endsWith("/cadastro/agendamento")) return "schedule";
  return "checklist";
}

export function onboardingPathForView(view: OnboardingView): string {
  if (view === "form") return "/cadastro/formulario";
  if (view === "transfer") return "/cadastro/transferencia";
  if (view === "contracts") return "/cadastro/contratos";
  if (view === "payment") return "/cadastro/pagamento";
  if (view === "schedule") return "/cadastro/agendamento";
  return "/cadastro";
}

export function pushOnboardingView(view: OnboardingView) {
  const url = new URL(window.location.href);
  url.pathname = onboardingPathForView(view);
  window.history.pushState({ cadastroOnboarding: view }, "", `${url.pathname}${url.search}${url.hash}`);
}

export function replaceOnboardingView(view: OnboardingView) {
  const url = new URL(window.location.href);
  url.pathname = onboardingPathForView(view);
  window.history.replaceState({ cadastroOnboarding: view }, "", `${url.pathname}${url.search}${url.hash}`);
}

export function goBackOnboarding(fallback: OnboardingView = "checklist") {
  if (window.history.state?.cadastroOnboarding) {
    window.history.back();
    return;
  }
  replaceOnboardingView(fallback);
}

type PersistState = {
  paid?: boolean;
  publicToken?: string;
  paymentUrl?: string;
  booked?: RegistrationBookingSummary;
};

function storageKey(token: string) {
  return `cadastro-onboarding:${token}`;
}

export function loadOnboardingPersist(token: string): PersistState {
  try {
    const raw = localStorage.getItem(storageKey(token));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOnboardingPersist(token: string, patch: PersistState) {
  const next = { ...loadOnboardingPersist(token), ...patch };
  localStorage.setItem(storageKey(token), JSON.stringify(next));
  return next;
}

export function brDateTime(date: string, time: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m} às ${time}`;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function needsRegistrationPayment(options: RegistrationLinkOptions) {
  return options.chargeGround || options.chargeEnrollment || options.chargeTransfer;
}

export function needsRegistrationBooking(options: RegistrationLinkOptions) {
  return options.allowFirstFlightBooking;
}

export function hasRegistrationOnboarding(options: RegistrationLinkOptions) {
  return needsRegistrationPayment(options) || needsRegistrationBooking(options);
}

export function paymentStepLabel(options: RegistrationLinkOptions) {
  const labels = [
    options.chargeEnrollment ? "matrícula" : null,
    options.chargeGround ? "Ground School" : null,
    options.chargeTransfer ? "taxa de transferência" : null,
  ].filter(Boolean);
  if (labels.length > 1) return `Pagamento de ${labels.join(", ").replace(/, ([^,]*)$/, " e $1")}`;
  if (options.chargeTransfer) return "Pagamento da taxa de transferência";
  if (options.chargeGround) return "Pagamento do Ground School";
  return "Pagamento da matrícula";
}

function fallbackProducts(options: RegistrationLinkOptions): RegistrationCheckoutProduct[] {
  const items: RegistrationCheckoutProduct[] = [];
  if (options.chargeEnrollment) {
    items.push({
      id: "enrollment",
      name: "Matrícula",
      price: 0,
      kind: "enrollment",
      description:
        "Taxa de matrícula para efetivar seu vínculo como aluno da escola e liberar o acesso à formação na plataforma.",
    });
  }
  if (options.chargeGround) {
    items.push({
      id: "ground",
      name: "Ground School",
      price: 0,
      kind: "ground",
      description:
        "Briefing teórico presencial sobre o avião e os procedimentos da escola. Acontece na EPEAC imediatamente antes do primeiro voo e dura entre 1h e 2h.",
    });
  }
  if (options.chargeTransfer) {
    items.push({
      id: "transfer",
      name: "Taxa de transferência",
      price: 0,
      kind: "transfer",
      description:
        "Taxa administrativa para validar a documentação de transferência e concluir o vínculo do aluno transferido na escola.",
    });
  }
  return items;
}

function RegistrationProductList({
  products,
  loading,
}: {
  products: RegistrationCheckoutProduct[];
  loading?: boolean;
}) {
  const total = products.reduce((sum, item) => sum + (item.price || 0), 0);
  return (
    <div className="divide-y divide-slate-800">
      {loading && products.every((item) => !item.price) ? (
        <p className="py-2 text-xs text-slate-500">Carregando valores...</p>
      ) : null}
      {products.map((product) => (
        <div key={product.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-slate-100">{product.name}</p>
            <p className="shrink-0 text-sm font-semibold text-sky-300">
              {loading && !(product.price > 0) ? "..." : formatBRL(product.price || 0)}
            </p>
          </div>
          {product.description ? <p className="mt-1 text-xs leading-relaxed text-slate-400">{product.description}</p> : null}
        </div>
      ))}
      <div className="flex items-center justify-between pt-3">
        <span className="text-xs text-slate-400">Total</span>
        <span className="text-sm font-semibold text-slate-100">
          {loading && !(total > 0) ? "..." : formatBRL(total)}
        </span>
      </div>
    </div>
  );
}

async function withCatalogPrices(
  options: RegistrationLinkOptions,
  products: RegistrationCheckoutProduct[],
): Promise<RegistrationCheckoutProduct[]> {
  if (products.some((item) => item.price > 0)) return products;
  const catalog = await listSchoolProducts().catch(() => []);
  if (!catalog.length) return products;
  const fallback = products.length ? products : fallbackProducts(options);
  return fallback.map((item) => {
    const match = catalog.find((product) => {
      const haystack = product.name.toLowerCase();
      if (item.kind === "ground") return haystack.includes("ground");
      if (item.kind === "transfer") return /transfer|transferencia|transferência/.test(haystack);
      return /matr/.test(haystack);
    });
    if (!match) return item;
    return {
      ...item,
      id: match.id || item.id,
      name: match.name || item.name,
      price: match.idealPrice || 0,
    };
  });
}

export function useRegistrationQuote(options: RegistrationLinkOptions, token: string, enabled: boolean) {
  const [products, setProducts] = useState<RegistrationCheckoutProduct[]>(() => fallbackProducts(options));
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    setLoading(true);
    void quoteRegistrationCheckout({
      token,
      chargeGround: options.chargeGround,
      chargeEnrollment: options.chargeEnrollment,
      chargeTransfer: options.chargeTransfer,
    })
      .then((quote) => {
        if (cancelled || !quote.products?.length) return;
        setProducts(quote.products);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, options.chargeEnrollment, options.chargeGround, options.chargeTransfer, token]);

  return { products, loading };
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StepBadge({
  done,
  current,
  index,
}: {
  done: boolean;
  current?: boolean;
  index: number;
}) {
  if (done) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
        <CheckIcon />
      </div>
    );
  }
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        current ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-500"
      }`}
    >
      {index}
    </div>
  );
}

export function RegistrationEntryChecklist({ options, onStartCadastro }: { options: RegistrationLinkOptions; onStartCadastro: () => void }) {
  return (
    <RegistrationChecklistCards
      options={options}
      cadastroDone={false}
      paid={false}
      booked={null}
      onStartCadastro={onStartCadastro}
      onPay={() => undefined}
      onSchedule={() => undefined}
    />
  );
}

export function RegistrationChecklistCards({
  options,
  cadastroDone = true,
  paid,
  booked,
  bookedDone,
  bookedLabel,
  isTransfer,
  transferDocumentDone,
  transferDocumentCount,
  showContracts,
  contractsDone,
  contractsCount,
  contractsLoading,
  onStartCadastro,
  onTransferDocuments,
  onContracts,
  onPay,
  onSchedule,
}: {
  options: RegistrationLinkOptions;
  cadastroDone?: boolean;
  paid: boolean;
  booked: RegistrationBookingSummary | null;
  bookedDone?: boolean;
  bookedLabel?: string;
  isTransfer?: boolean;
  transferDocumentDone?: boolean;
  transferDocumentCount?: number;
  showContracts?: boolean;
  contractsDone?: boolean;
  contractsCount?: number;
  contractsLoading?: boolean;
  onStartCadastro?: () => void;
  onTransferDocuments?: () => void;
  onContracts?: () => void;
  onPay: () => void;
  onSchedule: () => void;
}) {
  const showPayment = needsRegistrationPayment(options);
  const showBooking = needsRegistrationBooking(options);
  const showTransfer = Boolean(isTransfer);
  const transferDone = showTransfer && Boolean(transferDocumentDone);
  const showContractStep = Boolean(showContracts);
  const contractDone = showContractStep && Boolean(contractsDone);
  const contractReady = !contractsLoading && (contractsCount ?? 0) > 0;
  const contractLocked = !cadastroDone;
  const paymentDone = cadastroDone && (!showPayment || paid);
  const bookingDone = Boolean(booked) || Boolean(bookedDone);
  const bookingLocked = !cadastroDone || (showBooking && showPayment && !paid);
  const contractIndex = 2 + (showTransfer ? 1 : 0);
  const paymentIndex = contractIndex + (showContractStep ? 1 : 0);
  const bookingIndex = paymentIndex + (showPayment ? 1 : 0);

  return (
    <div className="divide-y divide-slate-800 text-left">
      <div className="flex items-start gap-3 py-3 first:pt-0">
        <StepBadge done={cadastroDone} current={!cadastroDone} index={1} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${cadastroDone ? "text-emerald-100" : "text-slate-100"}`}>Completar o cadastro</p>
          <p className={`text-xs ${cadastroDone ? "text-emerald-300/80" : "text-slate-500"}`}>
            {cadastroDone ? "Concluído" : "Envie seus dados"}
          </p>
          {!cadastroDone && onStartCadastro ? (
            <button
              type="button"
              onClick={onStartCadastro}
              className="mt-3 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
            >
              Iniciar cadastro
            </button>
          ) : null}
        </div>
      </div>

      {showTransfer ? (
        <div className={`flex items-start gap-3 py-3 ${cadastroDone ? "" : "opacity-60"}`}>
          <StepBadge done={transferDone} current={cadastroDone && !transferDone} index={2} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${transferDone ? "text-emerald-100" : "text-slate-100"}`}>
              Documentos da transferência
            </p>
            <p className={`text-xs ${transferDone ? "text-emerald-300/80" : "text-slate-500"}`}>
              {transferDone
                ? `${transferDocumentCount && transferDocumentCount > 1 ? `${transferDocumentCount} documentos anexados` : "Documento anexado"}`
                : cadastroDone
                  ? "Anexe o comprovante da transferência"
                  : "Depois do cadastro"}
            </p>
            {cadastroDone && !transferDone && onTransferDocuments ? (
              <button
                type="button"
                onClick={onTransferDocuments}
                className="mt-3 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
              >
                Anexar documento
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showContractStep ? (
        <div className={`flex items-start gap-3 py-3 ${contractLocked ? "opacity-60" : ""}`}>
          <StepBadge done={contractDone} current={!contractLocked && !contractDone} index={contractIndex} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${contractDone ? "text-emerald-100" : "text-slate-100"}`}>
              Assinatura de contratos
            </p>
            <p className={`text-xs ${contractDone ? "text-emerald-300/80" : "text-slate-500"}`}>
              {contractDone
                ? "Contratos assinados"
                : !cadastroDone
                  ? "Depois do cadastro"
                  : contractsLoading
                      ? "Preparando documentos para assinatura"
                      : contractReady
                        ? `${contractsCount} documento(s) para revisar e assinar`
                        : "Aguardando geração dos contratos"}
            </p>
            {cadastroDone && !contractDone && onContracts ? (
              <button
                type="button"
                disabled={contractLocked || !contractReady}
                onClick={onContracts}
                className="mt-3 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                Assinar contratos
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showPayment ? (
        <div className={`flex items-start gap-3 py-3 ${cadastroDone ? "" : "opacity-60"}`}>
          <StepBadge done={paymentDone} current={cadastroDone && !paymentDone} index={paymentIndex} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${paymentDone ? "text-emerald-100" : "text-slate-100"}`}>
              {paymentStepLabel(options)}
            </p>
            <p className={`text-xs ${paymentDone ? "text-emerald-300/80" : "text-slate-500"}`}>
              {paymentDone ? "Pagamento confirmado" : cadastroDone ? "Confira os valores e conclua o pagamento" : "Depois do cadastro"}
            </p>
            {cadastroDone && !paymentDone ? (
              <button
                type="button"
                onClick={onPay}
                className="mt-3 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
              >
                Realizar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showBooking ? (
        <div className={`flex items-start gap-3 py-3 last:pb-0 ${bookingLocked ? "opacity-60" : ""}`}>
          <StepBadge done={bookingDone} current={cadastroDone && !bookingDone && !bookingLocked} index={bookingIndex} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${bookingDone ? "text-emerald-100" : "text-slate-100"}`}>
              Agendar o Ground e o primeiro voo
            </p>
            <p className={`text-xs ${bookingDone ? "text-emerald-300/80" : "text-slate-500"}`}>
              {booked
                ? `${brDateTime(booked.date, booked.groundStart)} · voo ${booked.flightStart}${booked.presentationTime && booked.endTime ? ` (${booked.presentationTime}–${booked.endTime})` : ""}`
                : bookingDone
                  ? bookedLabel || "Agendamento confirmado"
                : !cadastroDone
                  ? "Depois do cadastro"
                  : bookingLocked
                    ? "Disponível após o pagamento"
                    : "Escolha data e horário"}
            </p>
            {cadastroDone && !bookingDone ? (
              <button
                type="button"
                disabled={bookingLocked}
                onClick={onSchedule}
                className="mt-3 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                Realizar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function addDaysIso(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function GroundAvailabilityCard({ enabled }: { enabled: boolean }) {
  const [label, setLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const from = addDaysIso(new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10), 2);
    const to = addDaysIso(from, 21);
    void getInitialRegistrationSchedule(from, to)
      .then((data) => {
        if (cancelled) return;
        const dates = Array.from({ length: 14 }, (_, index) => addDaysIso(from, index));
        const aircraftIdents = data.aircrafts.slice(0, 2).map((aircraft) => aircraft.registration);
        const firstDate = dates.find((date) => buildMergedRegistrationSlots({
          date,
          aircraftIdents,
          flights: data.flights,
          blockedSlots: data.blockedSlots,
          groundRegistration: data.groundRegistration,
          rules: data.rules,
        }).length > 0);
        setLabel(firstDate ? formatRegistrationDayLabel(firstDate) : null);
      })
      .catch(() => {
        if (!cancelled) setLabel(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <p className="text-sm font-semibold text-emerald-100">
        {loading
          ? "Consultando a próxima data de Ground..."
          : label
            ? `Ground disponível a partir de ${label}`
            : "No momento não há vaga de Ground nos próximos dias."}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-emerald-200/80">
        Para agendar a data é necessário realizar o pagamento, você também poderá escolher outras datas na próxima etapa.
      </p>
    </div>
  );
}

export function RegistrationPaymentView({
  token,
  userId,
  options,
  isTestMode,
  onBack,
  onPaid,
}: {
  token: string;
  userId: string | null;
  options: RegistrationLinkOptions;
  isTestMode?: boolean;
  onBack: () => void;
  onPaid: () => void;
}) {
  const [products, setProducts] = useState<RegistrationCheckoutProduct[]>(() => fallbackProducts(options));
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [paid, setPaid] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingQuote(true);
      try {
        const status = userId
          ? await getRegistrationCheckoutStatus({
              token,
              userId,
              chargeGround: options.chargeGround,
              chargeEnrollment: options.chargeEnrollment,
              chargeTransfer: options.chargeTransfer,
            }).catch(() => null)
          : null;
        if (cancelled) return;
        let nextProducts = status?.products?.length ? status.products : null;
        if (!nextProducts?.some((item) => item.price > 0)) {
          const quote = await quoteRegistrationCheckout({
            token,
            chargeGround: options.chargeGround,
            chargeEnrollment: options.chargeEnrollment,
            chargeTransfer: options.chargeTransfer,
          }).catch(() => null);
          if (cancelled) return;
          if (quote?.products?.length) nextProducts = quote.products;
        }
        if (cancelled) return;
        setProducts(await withCatalogPrices(options, nextProducts?.length ? nextProducts : fallbackProducts(options)));
        if (status?.paid) {
          setPaid(true);
          saveOnboardingPersist(token, { paid: true, publicToken: status.publicToken, paymentUrl: status.paymentUrl });
          onPaid();
          return;
        }
        if (status?.paymentUrl) setPaymentUrl(status.paymentUrl);
        if (status?.publicToken) setPublicToken(status.publicToken);
      } finally {
        if (!cancelled) setLoadingQuote(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [options.chargeEnrollment, options.chargeGround, options.chargeTransfer, token, userId]);

  useEffect(() => {
    if (paid) return;
    if (!publicToken && !paymentUrl) return;
    let cancelled = false;
    const poll = async () => {
      if (publicToken) {
        const { data } = await getPublicProposalByToken(publicToken).catch(() => ({ data: null }));
        if (cancelled) return;
        if (data?.paymentStatus === "paid") {
          setPaid(true);
          saveOnboardingPersist(token, { paid: true });
          onPaid();
          return;
        }
      }
      if (!userId) return;
      const status = await getRegistrationCheckoutStatus({
        token,
        userId,
        chargeGround: options.chargeGround,
        chargeEnrollment: options.chargeEnrollment,
        chargeTransfer: options.chargeTransfer,
      }).catch(() => null);
      if (cancelled || !status?.paid) return;
      setPaid(true);
      saveOnboardingPersist(token, { paid: true, publicToken: status.publicToken, paymentUrl: status.paymentUrl });
      onPaid();
    };
    void poll();
    const id = window.setInterval(() => void poll(), 4000);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [onPaid, options.chargeEnrollment, options.chargeGround, options.chargeTransfer, paid, paymentUrl, publicToken, token, userId]);

  function simulatePaid() {
    setPaid(true);
    saveOnboardingPersist(token, { paid: true });
    onPaid();
  }

  async function openCheckout() {
    if (!userId) {
      setErrorMsg("Conclua o cadastro antes de gerar o pagamento.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const checkout = await createRegistrationCheckout({
        token,
        userId,
        chargeGround: options.chargeGround,
        chargeEnrollment: options.chargeEnrollment,
        chargeTransfer: options.chargeTransfer,
      });
      if (checkout.products?.length) {
        setProducts(checkout.products);
      }
      setPaymentUrl(checkout.paymentUrl);
      if (checkout.publicToken) setPublicToken(checkout.publicToken);
      saveOnboardingPersist(token, {
        paymentUrl: checkout.paymentUrl,
        publicToken: checkout.publicToken,
      });
      window.open(checkout.paymentUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMsg((error as Error).message || "Não foi possível gerar o pagamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-slate-700/80 bg-slate-900 p-6 text-left">
      <button type="button" onClick={onBack} className="text-xs text-slate-500 hover:text-slate-300">
        ← Voltar ao checklist
      </button>
      <h2 className="mt-3 text-lg font-semibold text-slate-100">{paymentStepLabel(options)}</h2>
      <p className="mt-1 text-sm text-slate-400">
        Confira o que está incluso. O pagamento abre em uma nova aba e esta tela fica acompanhando até a confirmação.
      </p>

      <div className="mt-4">
        <RegistrationProductList products={products} loading={loadingQuote} />
      </div>

      <GroundAvailabilityCard enabled={needsRegistrationBooking(options)} />

      {errorMsg ? <p className="mt-3 text-xs text-red-300">{errorMsg}</p> : null}

      {paid ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-emerald-200">Pagamento confirmado</p>
          <p className="mt-1 text-xs text-slate-400">Você já pode seguir para o próximo passo.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Voltar ao checklist
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void openCheckout()}
            className="w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? "Abrindo pagamento..." : "Realizar pagamento"}
          </button>
          {paymentUrl ? (
            <a
              href={paymentUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-sky-300 underline underline-offset-2"
            >
              Se a aba não abrir, clique aqui
            </a>
          ) : null}
          <p className="text-center text-[11px] text-slate-500">
            {publicToken ? "Aguardando confirmação do pagamento..." : "O checkout será aberto em um site externo."}
          </p>
          {isTestMode ? (
            <button
              type="button"
              onClick={simulatePaid}
              className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
            >
              Simular pagamento (teste)
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function RegistrationReadyView({
  name,
  booked,
  includePayment,
  includeBooking,
}: {
  name: string;
  booked: RegistrationBookingSummary | null;
  includePayment: boolean;
  includeBooking: boolean;
}) {
  const [brand, setBrand] = useState<EmailBrandSettings | null>(() => getCachedBrandSettings());
  const firstName = name.trim().split(/\s+/)[0] || "aluno";
  const summary = includePayment && includeBooking
    ? "Cadastro, pagamento e agendamento concluídos."
    : includePayment
      ? "Cadastro e pagamento concluídos."
      : includeBooking
        ? "Cadastro e agendamento concluídos."
        : "Cadastro concluído.";
  const directionsTitle = brand?.registrationDirectionsTitle?.trim() || "Como chegar na EPEAC";
  const directionsPlace = brand?.registrationDirectionsPlace?.trim() || "Aeroporto Campo de Marte (SBMT)";
  const directionsText =
    brand?.registrationDirectionsText?.trim() ||
    "Av. Santos Dumont, 1979 — Santana, São Paulo/SP. Chegue com 15 a 20 minutos de antecedência, siga a sinalização até a escola e na portaria informe que você é aluno e vem para o Ground School.";
  const mapsUrl = brand?.registrationDirectionsMapsUrl?.trim() || "https://maps.google.com/?q=EPEAC+Escola+de+Pilotagem+Campo+de+Marte";
  const nextStepsTitle = brand?.registrationNextStepsTitle?.trim() || "Próximos passos";
  const nextStepsItems = brand?.registrationNextStepsItems?.length
    ? brand.registrationNextStepsItems
    : [
        "O nosso Ground School acontece logo antes do primeiro voo. Ele dura entre 1h e 2h.",
        booked
          ? `O seu Ground School está agendado para ${brDateTime(booked.date, booked.groundStart)}, logo antes do seu primeiro voo.`
          : "O seu Ground School acontece logo antes do seu primeiro voo.",
        "Após o Ground School você fará uma breve prova na escola em cima dos ensinamentos sobre o avião. É necessário alcançar pelo menos 70% na prova para ser liberado para o voo.",
      ];
  const materialsTitle = brand?.registrationMaterialsTitle?.trim() || "Material e avisos importantes";
  const materialsItems = brand?.registrationMaterialsItems?.length
    ? brand.registrationMaterialsItems
    : [
        "O seu acesso na plataforma app.epeac.com.br já está liberado. O login é o seu e-mail e a senha é o seu CPF só com números, ou a senha que você criou no cadastro.",
        "Na plataforma temos a aba \"Manuais\" com todos os materiais que você vai precisar. É muito importante ler os manuais antes do Ground.",
        "Na aba \"Jornada\" você consegue ver todo o cronograma de formação e as missões, além dos detalhes que serão cobrados em cada voo.",
        "É obrigatória a leitura do Manual do Aluno que está na plataforma antes do seu Ground School — ele contém todos os detalhes e regras da escola.",
      ];
  const appUrl = brand?.appUrl?.trim() || (typeof window !== "undefined" ? window.location.origin : "");

  useEffect(() => {
    let cancelled = false;
    void getEmailBrandSettings()
      .then((settings) => {
        if (!cancelled) setBrand(settings);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full rounded-2xl border border-slate-700/80 bg-slate-900 p-6 text-left">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
          <CheckIcon />
        </div>
        <h2 className="text-lg font-semibold text-slate-100">Tudo pronto, {firstName}!</h2>
        <p className="mt-1 text-sm text-slate-400">
          {summary} Confira o resumo e os próximos passos abaixo.
        </p>
        {appUrl ? (
          <a
            href={appUrl}
            className="mt-4 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Ir para a plataforma
          </a>
        ) : null}
      </div>

      {booked ? (
        <div className="mt-6 border-t border-slate-800 pt-5">
          <p className="text-sm font-semibold text-slate-100">O que você agendou</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            <li>Ground School: {brDateTime(booked.date, booked.groundStart)} até {booked.groundEnd || booked.presentationTime || booked.flightStart}</li>
            <li>
              Primeiro voo: acionamento {booked.flightStart}
              {booked.presentationTime && booked.endTime
                ? ` · apresentação ${booked.presentationTime}${booked.cutoffTime ? ` · corte ${booked.cutoffTime}` : ""} · encerramento ${booked.endTime}`
                : ""}
            </li>
          </ul>
        </div>
      ) : null}

      {includeBooking ? (
        <>
          <div className="mt-6 border-t border-slate-800 pt-5">
            <p className="text-sm font-semibold text-slate-100">{directionsTitle}</p>
            <p className="mt-2 text-sm font-medium text-slate-200">{directionsPlace}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {directionsText}
            </p>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-xs font-medium text-sky-300 hover:text-sky-200"
            >
              Abrir no Google Maps
            </a>
          </div>

          <div className="mt-6 border-t border-slate-800 pt-5">
            <p className="text-sm font-semibold text-slate-100">{nextStepsTitle}</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-slate-400">
              {nextStepsItems.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </div>
        </>
      ) : null}

      <div className="mt-6 border-t border-slate-800 pt-5">
        <p className="text-sm font-semibold text-slate-100">{materialsTitle}</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-400">
          {materialsItems.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </div>
  );
}

export function useRegistrationPaymentStatus(options: {
  enabled: boolean;
  token: string;
  userId: string | null;
  chargeGround: boolean;
  chargeEnrollment: boolean;
  chargeTransfer: boolean;
}) {
  const persisted = useMemo(() => loadOnboardingPersist(options.token), [options.token]);
  const [paid, setPaid] = useState(Boolean(persisted.paid));

  useEffect(() => {
    if (!options.enabled || !options.userId) return;
    let cancelled = false;
    void getRegistrationCheckoutStatus({
      token: options.token,
      userId: options.userId,
      chargeGround: options.chargeGround,
      chargeEnrollment: options.chargeEnrollment,
      chargeTransfer: options.chargeTransfer,
    })
      .then((status) => {
        if (cancelled || !status.paid) return;
        setPaid(true);
        saveOnboardingPersist(options.token, { paid: true, publicToken: status.publicToken, paymentUrl: status.paymentUrl });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [options.chargeEnrollment, options.chargeGround, options.chargeTransfer, options.enabled, options.token, options.userId]);

  const markPaid = useCallback(() => {
    setPaid(true);
    saveOnboardingPersist(options.token, { paid: true });
  }, [options.token]);

  return { paid, markPaid };
}
