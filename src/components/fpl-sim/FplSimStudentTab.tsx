import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { getFplHelp } from "../../lib/fplMcaHelp";
import {
  FPL_10A_SECTIONS,
  FPL_10B_SECTIONS,
  FPL_FLIGHT_RULES,
  FPL_FLIGHT_TYPES,
  FPL_ITEM18_TAGS,
  FPL_PER_CODES,
  FPL_WAKE,
  all10aItems,
  all10bItems,
  displayTime,
  emptyFplForm,
  formatEq10,
  icaoOrZzzz,
  toggleExclusiveCode,
} from "../../lib/fplSimCatalog";
import { deleteFplPlan, getFplProTips, listFplPlans, saveFplPlan } from "../../lib/fplSimDb";
import { buildFplPreview, validateFplForm } from "../../lib/fplSimValidate";
import type { FplPlanForm, FplProTips, FplSavedPlan, FplValidationIssue } from "../../types/fplSim";
import { StudentPageHeader } from "../student/StudentExperience";
import { FlightReviewClubGate } from "../FlightReviewClubGate";
import { useToast } from "../ui/ToastProvider";
import {
  FPL_BLUE,
  FPL_GREEN,
  FplFab,
  FplHeader,
  FplInputRow,
  FplPhone,
  FplRow,
  FplSection,
  FplSegmented,
  FplStatusDot,
  FplToggle,
  FplToggleRow,
} from "./fplSimUi";

type Screen =
  | "list"
  | "picker"
  | "form"
  | "10a"
  | "10b"
  | "route"
  | "item19"
  | "item18"
  | "details"
  | "help"
  | "result";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label="Ajuda">
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
        <path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
      </svg>
    </button>
  );
}

export function FplSimSideDrawer({
  open,
  onClose,
  locked,
}: {
  open: boolean;
  onClose: () => void;
  locked?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-[80] flex justify-end bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label="Simulador FPL"
    >
      <aside
        className={`flex h-full w-full max-w-[640px] flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {locked ? (
          <div className="flex h-full flex-col bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-100">Simulador FPL</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                aria-label="Fechar"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center p-4">
              <FlightReviewClubGate />
            </div>
          </div>
        ) : (
          <FplSimStudentTab variant="drawer" onClose={onClose} />
        )}
      </aside>
    </div>
  );
}

export function FplSimStudentTab({
  variant = "page",
  onClose,
}: {
  variant?: "page" | "drawer";
  onClose?: () => void;
} = {}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [screen, setScreen] = useState<Screen>("list");
  const [helpId, setHelpId] = useState("kind");
  const [plans, setPlans] = useState<FplSavedPlan[]>([]);
  const [tips, setTips] = useState<FplProTips>({});
  const [currentId, setCurrentId] = useState<string | undefined>();
  const [form, setForm] = useState<FplPlanForm>(() => emptyFplForm("pvs"));
  const [issues, setIssues] = useState<FplValidationIssue[]>([]);
  const [tab, setTab] = useState<"ats" | "fav">("ats");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [rows, proTips] = await Promise.all([listFplPlans(user.id, user.schoolId), getFplProTips(user.schoolId)]);
    setPlans(rows);
    setTips(proTips);
  }, [user?.id, user?.schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (partial: Partial<FplPlanForm>) =>
    setForm((prev) => {
      const next = { ...prev, ...partial };
      const keys = [...next.item18Keys];
      const add = (key: string) => {
        if (!keys.includes(key)) keys.push(key);
      };
      if (next.aircraftType.trim().toUpperCase() === "ZZZZ") add("TYP");
      if (next.depAd.trim().toUpperCase() === "ZZZZ") add("DEP");
      if (next.destAd.trim().toUpperCase() === "ZZZZ") add("DEST");
      if (next.altn.trim().toUpperCase() === "ZZZZ" || next.altn2.trim().toUpperCase() === "ZZZZ") add("ALTN");
      if (next.eq10a.includes("R")) add("PBN");
      if (next.eq10a.includes("Z")) add("NAV");
      if (next.callsignEnabled) add("RMK");
      if (next.callsignEnabled && next.callsign.trim() && !/INDICATIVO/i.test(next.item18.RMK ?? "")) {
        next.item18 = {
          ...next.item18,
          RMK: `INDICATIVO DE CHAMADA ${next.callsign.trim().toUpperCase()}`.trim(),
        };
      }
      next.item18Keys = keys;
      return next;
    });
  const patch19 = (partial: Partial<FplPlanForm["item19"]>) =>
    setForm((prev) => ({ ...prev, item19: { ...prev.item19, ...partial } }));

  function openHelp(id: string) {
    setHelpId(id);
    setScreen("help");
  }

  function startNew() {
    setCurrentId(undefined);
    setForm(emptyFplForm("pvs"));
    setIssues([]);
    setScreen("picker");
  }

  function openPlan(plan: FplSavedPlan) {
    setCurrentId(plan.id);
    setForm(plan.form);
    setIssues([]);
    setScreen("details");
  }

  async function persist(status: FplSavedPlan["status"], lastErrors: string[]) {
    if (!user?.id) return;
    setBusy(true);
    try {
      const saved = await saveFplPlan({
        id: currentId,
        userId: user.id,
        schoolId: user.schoolId,
        form,
        status,
        lastErrors,
      });
      setCurrentId(saved.id);
      await load();
      showToast({ variant: "success", message: "Plano salvo neste simulador." });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao salvar." });
    }
    setBusy(false);
  }

  function validate() {
    const next = validateFplForm(form);
    setIssues(next);
    const errors = next.filter((item) => item.severity === "error");
    void persist(errors.length ? "invalid" : "valid", next.map((item) => item.message));
    setScreen("result");
  }

  async function removePlan(id: string) {
    if (!user?.id) return;
    if (!window.confirm("Excluir este plano de estudo?")) return;
    await deleteFplPlan(id, user.id);
    await load();
    setScreen("list");
  }

  const help = getFplHelp(helpId);
  const eqA = formatEq10(form.eq10a);
  const eqB = formatEq10(form.eq10b);

  return (
    <div className={variant === "drawer" ? "flex h-full min-h-0 flex-col" : "space-y-4"}>
      {variant === "page" ? (
        <StudentPageHeader
          eyebrow="Estudo"
          title="Simulador FPL"
          description="Ferramenta exclusiva de treino. Replica o fluxo do FPL-BR e valida o preenchimento pela MCA 100-11. Não envia mensagem ATS ao DECEA/CGNA."
        />
      ) : null}
      <FplPhone fill={variant === "drawer"}>
        <div className={`relative flex min-h-0 flex-col bg-white text-slate-900 ${variant === "drawer" ? "h-full flex-1" : "h-[min(78vh,760px)]"}`}>
          {screen === "list" ? (
            <ListScreen
              tab={tab}
              onTab={setTab}
              plans={plans}
              onNew={startNew}
              onOpen={openPlan}
              onClose={onClose}
            />
          ) : null}
          {screen === "picker" ? (
            <PickerScreen
              onBack={() => setScreen("list")}
              onHelp={() => openHelp("kind")}
              tip={tips.kind}
              onChoose={(kind) => {
                setForm(emptyFplForm(kind));
                setScreen("form");
              }}
            />
          ) : null}
          {screen === "form" ? (
            <FormScreen
              form={form}
              patch={patch}
              onBack={() => setScreen(currentId ? "details" : "picker")}
              onHelp={openHelp}
              onOpen10a={() => setScreen("10a")}
              onOpen10b={() => setScreen("10b")}
              onOpenRoute={() => setScreen("route")}
              onOpen19={() => setScreen("item19")}
              onOpen18={() => setScreen("item18")}
              onValidate={validate}
              eqA={eqA}
              eqB={eqB}
            />
          ) : null}
          {screen === "10a" ? (
            <ToggleListScreen
              title="10 A"
              sections={FPL_10A_SECTIONS}
              selected={form.eq10a}
              onBack={() => setScreen("form")}
              onHelp={() => openHelp("eq10a")}
              onToggle={(code) => patch({ eq10a: toggleExclusiveCode(form.eq10a, code, all10aItems()) })}
            />
          ) : null}
          {screen === "10b" ? (
            <ToggleListScreen
              title="10 B"
              sections={FPL_10B_SECTIONS}
              selected={form.eq10b}
              onBack={() => setScreen("form")}
              onHelp={() => openHelp("eq10b")}
              onToggle={(code) => patch({ eq10b: toggleExclusiveCode(form.eq10b, code, all10bItems()) })}
            />
          ) : null}
          {screen === "route" ? (
            <RouteScreen form={form} patch={patch} onBack={() => setScreen("form")} onHelp={() => openHelp("route")} />
          ) : null}
          {screen === "item19" ? (
            <Item19Screen form={form} patch19={patch19} onBack={() => setScreen("form")} onHelp={openHelp} />
          ) : null}
          {screen === "item18" ? (
            <Item18Modal
              form={form}
              patch={patch}
              onClose={() => setScreen("form")}
            />
          ) : null}
          {screen === "details" ? (
            <DetailsScreen
              form={form}
              planId={currentId}
              onBack={() => setScreen("list")}
              onEdit={() => setScreen("form")}
              onDelete={() => currentId && void removePlan(currentId)}
              onOpenRoute={() => setScreen("route")}
              onOpen19={() => setScreen("item19")}
            />
          ) : null}
          {screen === "help" ? (
            <HelpScreen
              fieldId={helpId}
              title={help.title}
              mcaRef={help.mcaRef}
              body={help.body}
              tip={tips[helpId]}
              onBack={() => setScreen(helpId === "kind" ? "picker" : "form")}
            />
          ) : null}
          {screen === "result" ? (
            <ResultScreen
              issues={issues}
              preview={buildFplPreview(form)}
              onBack={() => setScreen("form")}
              onFix={(fieldId) => {
                if (fieldId === "eq10a") setScreen("10a");
                else if (fieldId === "eq10b") setScreen("10b");
                else if (fieldId === "route") setScreen("route");
                else if (["endurance", "personsOnBoard", "dinghies", "aircraftColor", "picName", "anac1", "phone"].includes(fieldId))
                  setScreen("item19");
                else setScreen("form");
              }}
            />
          ) : null}
          {busy ? <div className="absolute inset-0 bg-white/40" /> : null}
        </div>
      </FplPhone>
    </div>
  );
}

function ListScreen({
  tab,
  onTab,
  plans,
  onNew,
  onOpen,
  onClose,
}: {
  tab: "ats" | "fav";
  onTab: (tab: "ats" | "fav") => void;
  plans: FplSavedPlan[];
  onNew: () => void;
  onOpen: (plan: FplSavedPlan) => void;
  onClose?: () => void;
}) {
  const rows = tab === "fav" ? plans.filter((plan) => plan.status === "valid") : plans;
  return (
    <div className="flex h-full flex-col">
      <FplHeader
        title="FPL BR"
        menu={!onClose}
        onClose={onClose}
        right={
          <div className="flex items-center pr-1 text-white">
            <span className="grid h-10 w-10 place-items-center opacity-80">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
              </svg>
            </span>
            <span className="relative grid h-10 w-10 place-items-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
              </svg>
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="grid h-10 w-10 place-items-center opacity-80">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
            </span>
          </div>
        }
      />
      <div className="flex border-b border-slate-200 bg-white text-sm font-semibold">
        <button
          type="button"
          className="flex-1 py-3"
          style={{ color: tab === "ats" ? FPL_GREEN : "#78909C", borderBottom: tab === "ats" ? `3px solid ${FPL_GREEN}` : "3px solid transparent" }}
          onClick={() => onTab("ats")}
        >
          MENSAGENS ATS
        </button>
        <button
          type="button"
          className="flex-1 py-3"
          style={{ color: tab === "fav" ? FPL_GREEN : "#78909C", borderBottom: tab === "fav" ? `3px solid ${FPL_GREEN}` : "3px solid transparent" }}
          onClick={() => onTab("fav")}
        >
          FAVORITOS
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto bg-[#F4F6F8]">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            {tab === "fav" ? "Nenhum plano validado ainda." : "Nenhum plano salvo. Toque em + para criar."}
          </p>
        ) : (
          rows.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => onOpen(plan)}
              className="flex w-full gap-3 border-b border-slate-200 bg-white px-3 py-3 text-left"
            >
              <FplStatusDot status={plan.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">FPL</span>
                  <span className="text-xs font-semibold" style={{ color: FPL_GREEN }}>
                    {formatWhen(plan.updatedAt)}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                  <div>
                    <div className="font-semibold">{plan.form.depAd || "----"}</div>
                    <div className="text-[11px] text-slate-500">
                      {plan.form.aircraftId || "-----"} {plan.form.aircraftType}
                    </div>
                  </div>
                  <span className="text-slate-400">→</span>
                  <div className="text-right">
                    <div className="font-semibold">{plan.form.destAd || "----"}</div>
                    <div className="text-[11px] text-slate-500">
                      {plan.form.flightRules || "—"} {plan.form.cruiseSpeed || plan.form.level}
                    </div>
                  </div>
                </div>
                {plan.form.route ? (
                  <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{plan.form.route}</div>
                ) : null}
              </div>
            </button>
          ))
        )}
        <FplFab icon="plus" label="Novo plano" onClick={onNew} />
      </div>
    </div>
  );
}

function PickerScreen({
  onBack,
  onHelp,
  onChoose,
  tip,
}: {
  onBack: () => void;
  onHelp: () => void;
  onChoose: (kind: FplPlanForm["kind"]) => void;
  tip?: string;
}) {
  return (
    <div className="flex h-full flex-col bg-[#F4F6F8]">
      <FplHeader title="Novo FPL" onBack={onBack} right={<InfoButton onClick={onHelp} />} />
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Estudo — escolha o tipo</p>
        <button type="button" className="w-full rounded-xl bg-white p-4 text-left shadow-sm" onClick={() => onChoose("pvs")}>
          <div className="text-base font-bold" style={{ color: FPL_BLUE }}>
            FPL Simplificado — PVS
          </div>
          <p className="mt-2 text-sm leading-5 text-slate-600">
            Use quando o voo for <strong>VFR</strong> e permanecer na ATZ, CTR, TMA, FIZ ou a até <strong>50 km (27 NM)</strong> do
            aeródromo de partida. Preenchimento conforme MCA 100-11 item 3 (Anexo B).
          </p>
        </button>
        <button type="button" className="w-full rounded-xl bg-white p-4 text-left shadow-sm" onClick={() => onChoose("pvc")}>
          <div className="text-base font-bold" style={{ color: FPL_BLUE }}>
            FPL Completo — PVC
          </div>
          <p className="mt-2 text-sm leading-5 text-slate-600">
            Use para <strong>IFR</strong>, mudança de regra (Y/Z) ou voo que sai dos limites do PVS. Preencha os itens 7 a 19
            (MCA 100-11 item 2.1.1).
          </p>
        </button>
        {tip ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="text-[11px] font-bold uppercase tracking-wide">Pro-tip da escola</div>
            <p className="mt-1 leading-5">{tip}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FormScreen({
  form,
  patch,
  onBack,
  onHelp,
  onOpen10a,
  onOpen10b,
  onOpenRoute,
  onOpen19,
  onOpen18,
  onValidate,
  eqA,
  eqB,
}: {
  form: FplPlanForm;
  patch: (partial: Partial<FplPlanForm>) => void;
  onBack: () => void;
  onHelp: (id: string) => void;
  onOpen10a: () => void;
  onOpen10b: () => void;
  onOpenRoute: () => void;
  onOpen19: () => void;
  onOpen18: () => void;
  onValidate: () => void;
  eqA: string;
  eqB: string;
}) {
  const title = form.kind === "pvs" ? "Criar FPL Simplificado - PVS" : "Criar FPL Completo - PVC";
  return (
    <div className="flex h-full flex-col">
      <FplHeader title={title} onBack={onBack} />
      <div className="relative min-h-0 flex-1 overflow-y-auto pb-20">
        <FplSection>Campo 7</FplSection>
        <FplInputRow label="Identificação da Aeronave" required value={form.aircraftId} onChange={(v) => patch({ aircraftId: v.toUpperCase() })} onHelp={() => onHelp("aircraftId")} />
        <div className="flex min-h-[52px] items-center justify-between border-b border-slate-200 px-4">
          <button type="button" className="text-[15px] text-slate-800" onClick={() => onHelp("callsign")}>
            Indicativo de chamada
          </button>
          <FplToggle on={form.callsignEnabled} onChange={(on) => patch({ callsignEnabled: on })} />
        </div>
        {form.callsignEnabled ? (
          <FplInputRow label="Indicativo" required value={form.callsign} onChange={(v) => patch({ callsign: v.toUpperCase() })} />
        ) : null}

        <FplSection>Campo 8</FplSection>
        <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-slate-200 px-4">
          <button type="button" className="text-[15px] text-slate-800" onClick={() => onHelp("flightRules")}>
            Regras de voo<span className="text-red-500">*</span>
          </button>
          <FplSegmented options={[...FPL_FLIGHT_RULES]} value={form.flightRules} onChange={(v) => patch({ flightRules: v })} />
        </div>
        <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-slate-200 px-4">
          <button type="button" className="text-[15px] text-slate-800" onClick={() => onHelp("flightType")}>
            Tipo de voo<span className="text-red-500">*</span>
          </button>
          <FplSegmented options={[...FPL_FLIGHT_TYPES]} value={form.flightType} onChange={(v) => patch({ flightType: v })} />
        </div>

        <FplSection>Campo 9</FplSection>
        <FplInputRow label="Número" value={form.number} onChange={(v) => patch({ number: v.replace(/\D/g, "").slice(0, 2) })} placeholder="só em formação" onHelp={() => onHelp("number")} />
        <FplInputRow label="Tipo de Aeronave" required value={form.aircraftType} onChange={(v) => patch({ aircraftType: v.toUpperCase().slice(0, 4) })} onHelp={() => onHelp("aircraftType")} />
        <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-slate-200 px-4">
          <button type="button" className="text-left text-[15px] text-slate-800" onClick={() => onHelp("wake")}>
            Cat. Est. de Turbulência<span className="text-red-500">*</span>
          </button>
          <FplSegmented options={[...FPL_WAKE]} value={form.wake} onChange={(v) => patch({ wake: v })} />
        </div>

        <FplSection>Campo 10</FplSection>
        <FplRow label="A" required value={eqA || "Radiocomunicações, Auxílios à Navegação e à Aproximação"} chevron onClick={onOpen10a} />
        <FplRow label="B" required value={eqB || "Vigilância"} chevron onClick={onOpen10b} />

        <FplSection>Campo 13</FplSection>
        <FplInputRow label="Aeródromo de Partida" required value={form.depAd} onChange={(v) => patch({ depAd: icaoOrZzzz(v).slice(0, 4) })} onHelp={() => onHelp("depAd")} />
        <FplInputRow label="Hora" required value={displayTime(form.depTime)} onChange={(v) => patch({ depTime: v.replace(/\D/g, "").slice(0, 4) })} placeholder="HH:MM UTC" onHelp={() => onHelp("depTime")} />

        <FplSection>Campo 16</FplSection>
        <FplInputRow label="Aeródromo de Destino" required value={form.destAd} onChange={(v) => patch({ destAd: icaoOrZzzz(v).slice(0, 4) })} onHelp={() => onHelp("destAd")} />
        <FplInputRow label="EET Total" required value={displayTime(form.eet)} onChange={(v) => patch({ eet: v.replace(/\D/g, "").slice(0, 4) })} placeholder="HH:MM" onHelp={() => onHelp("eet")} />
        <FplInputRow label="Aeródromo Altn." required value={form.altn} onChange={(v) => patch({ altn: icaoOrZzzz(v).slice(0, 4) })} onHelp={() => onHelp("altn")} />
        <FplInputRow label="2º Aeródromo Altn." value={form.altn2} onChange={(v) => patch({ altn2: icaoOrZzzz(v).slice(0, 4) })} onHelp={() => onHelp("altn2")} />

        <FplSection>Campo 15</FplSection>
        <FplInputRow label="Velocidade de Cruzeiro" required value={form.cruiseSpeed} onChange={(v) => patch({ cruiseSpeed: v.toUpperCase().slice(0, 5) })} placeholder="N0090" onHelp={() => onHelp("cruiseSpeed")} />
        <FplInputRow label="Nível" required value={form.level} onChange={(v) => patch({ level: v.toUpperCase().slice(0, 5) })} placeholder="VFR ou A035" onHelp={() => onHelp("level")} />
        <FplRow label="Rota" required value={form.route || "Toque para preencher"} chevron onClick={onOpenRoute} />

        <FplSection>Campo 18</FplSection>
        <FplRow
          label="Outras Informações"
          value={form.item18Keys.length ? form.item18Keys.map((k) => `${k}/`).join(" ") : "Adicionar indicadores"}
          onClick={onOpen18}
        >
          <span className="text-xl font-bold" style={{ color: FPL_GREEN }}>+</span>
        </FplRow>
        <FplInputRow label="DOF/" value={form.dof} onChange={(v) => patch({ dof: v.replace(/\D/g, "").slice(0, 6) })} placeholder="YYMMDD" onHelp={() => onHelp("dof")} />
        {form.item18Keys.map((key) =>
          key === "PER" ? (
            <div key={key} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-slate-200 px-4">
              <button type="button" className="text-[15px] text-slate-800" onClick={() => onHelp("PER")}>
                PER/
              </button>
              <FplSegmented
                options={FPL_PER_CODES.map((code) => ({ code }))}
                value={form.item18.PER ?? ""}
                onChange={(code) => patch({ item18: { ...form.item18, PER: code } })}
              />
            </div>
          ) : (
            <div key={key} className="flex items-center border-b border-slate-200">
              <button
                type="button"
                className="grid h-10 w-10 place-items-center text-red-500"
                onClick={() =>
                  patch({
                    item18Keys: form.item18Keys.filter((k) => k !== key),
                    item18: { ...form.item18, [key]: "" },
                  })
                }
                aria-label={`Remover ${key}`}
              >
                −
              </button>
              <div className="flex-1">
                <FplInputRow
                  label={`${key}/`}
                  value={form.item18[key] ?? ""}
                  onChange={(v) => patch({ item18: { ...form.item18, [key]: v.toUpperCase() } })}
                  onHelp={() => onHelp(key)}
                />
              </div>
            </div>
          ),
        )}

        <FplSection>Campo 19</FplSection>
        <FplRow
          label="Informações Suplementares"
          required
          value={form.item19.picName ? `${form.item19.picName} · ${form.item19.personsOnBoard || "?"} POB` : "Autonomia, POB, sobrevivência…"}
          chevron
          onClick={onOpen19}
        />
      </div>
      <FplFab icon="check" label="Validar" onClick={onValidate} />
    </div>
  );
}

function ToggleListScreen({
  title,
  sections,
  selected,
  onBack,
  onHelp,
  onToggle,
}: {
  title: string;
  sections: typeof FPL_10A_SECTIONS;
  selected: string[];
  onBack: () => void;
  onHelp: () => void;
  onToggle: (code: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <FplHeader title={title} onBack={onBack} right={<InfoButton onClick={onHelp} />} />
      <div className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title}>
            <FplSection>{section.title}</FplSection>
            {section.items.map((item, index) => (
              <FplToggleRow
                key={item.code}
                code={item.code}
                label={item.label}
                on={selected.includes(item.code)}
                onChange={() => onToggle(item.code)}
                zebra={index % 2 === 1}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RouteScreen({
  form,
  patch,
  onBack,
  onHelp,
}: {
  form: FplPlanForm;
  patch: (partial: Partial<FplPlanForm>) => void;
  onBack: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <FplHeader title="Rota" onBack={onBack} right={<InfoButton onClick={onHelp} />} />
      <textarea
        className="h-full min-h-[240px] flex-1 resize-none p-4 font-mono text-sm uppercase outline-none"
        value={form.route}
        onChange={(e) => patch({ route: e.target.value.toUpperCase() })}
        placeholder="DCT 2306S04634W DCT&#10;ou REA / SID STAR / pontos"
      />
    </div>
  );
}

function Item19Screen({
  form,
  patch19,
  onBack,
  onHelp,
}: {
  form: FplPlanForm;
  patch19: (partial: Partial<FplPlanForm["item19"]>) => void;
  onBack: () => void;
  onHelp: (id: string) => void;
}) {
  const i19 = form.item19;
  return (
    <div className="flex h-full flex-col">
      <FplHeader title="Suplementares" onBack={onBack} right={<InfoButton onClick={() => onHelp("endurance")} />} />
      <div className="flex-1 overflow-y-auto pb-6">
        <FplSection>Campo 19</FplSection>
        <FplInputRow label="Autonomia" required value={displayTime(i19.endurance)} onChange={(v) => patch19({ endurance: v.replace(/\D/g, "").slice(0, 4) })} onHelp={() => onHelp("endurance")} />
        <FplInputRow label="Pessoas a bordo" required value={i19.personsOnBoard} onChange={(v) => patch19({ personsOnBoard: v.toUpperCase().slice(0, 3) })} onHelp={() => onHelp("personsOnBoard")} />

        <FplSection>Equipamento Rádio de Emergência</FplSection>
        <RadioToggle label="U / UHF" on={i19.radioU} onChange={(on) => patch19({ radioU: on })} />
        <RadioToggle label="V / VHF" on={i19.radioV} onChange={(on) => patch19({ radioV: on })} />
        <RadioToggle label="E / ELT" on={i19.radioE} onChange={(on) => patch19({ radioE: on })} />

        <FplSection>Equipamento de Sobrevivência</FplSection>
        <RadioToggle label="S" on={i19.survivalS} onChange={(on) => patch19({ survivalS: on })} />
        {i19.survivalS ? (
          <>
            <RadioToggle label="P / Polar" on={i19.survivalP} onChange={(on) => patch19({ survivalP: on })} />
            <RadioToggle label="D / Deserto" on={i19.survivalD} onChange={(on) => patch19({ survivalD: on })} />
            <RadioToggle label="M / Marítimo" on={i19.survivalM} onChange={(on) => patch19({ survivalM: on })} />
            <RadioToggle label="J / Selva" on={i19.survivalJ} onChange={(on) => patch19({ survivalJ: on })} />
          </>
        ) : null}

        <FplSection>Coletes</FplSection>
        <RadioToggle label="J" on={i19.jacketJ} onChange={(on) => patch19({ jacketJ: on })} />
        {i19.jacketJ ? (
          <>
            <RadioToggle label="L / Luz" on={i19.jacketL} onChange={(on) => patch19({ jacketL: on })} />
            <RadioToggle label="F / Fluores" on={i19.jacketF} onChange={(on) => patch19({ jacketF: on })} />
            <RadioToggle label="U / UHF" on={i19.jacketU} onChange={(on) => patch19({ jacketU: on })} />
            <RadioToggle label="V / VHF" on={i19.jacketV} onChange={(on) => patch19({ jacketV: on })} />
          </>
        ) : null}

        <FplSection>Botes</FplSection>
        <RadioToggle label="D" on={i19.dinghyD} onChange={(on) => patch19({ dinghyD: on })} />
        {i19.dinghyD ? (
          <>
            <FplInputRow label="Número" value={i19.dinghyNumber} onChange={(v) => patch19({ dinghyNumber: v.replace(/\D/g, "").slice(0, 2) })} />
            <FplInputRow label="Capacidade" value={i19.dinghyCapacity} onChange={(v) => patch19({ dinghyCapacity: v.replace(/\D/g, "").slice(0, 3) })} />
            <RadioToggle label="C / Abrigo" on={i19.dinghyCover} onChange={(on) => patch19({ dinghyCover: on })} />
            <FplInputRow label="Cor" value={i19.dinghyColor} onChange={(v) => patch19({ dinghyColor: v.toUpperCase() })} />
          </>
        ) : null}

        <FplSection>Informações adicionais</FplSection>
        <FplInputRow label="Cor e Marca da ANV" required value={i19.aircraftColor} onChange={(v) => patch19({ aircraftColor: v.toUpperCase() })} onHelp={() => onHelp("aircraftColor")} />
        <FplInputRow label="Observações" value={i19.remarks} onChange={(v) => patch19({ remarks: v.toUpperCase() })} />
        <FplInputRow label="Piloto em comando" required value={i19.picName} onChange={(v) => patch19({ picName: v.toUpperCase() })} onHelp={() => onHelp("picName")} />
        <FplInputRow label="Cód. ANAC 1º Piloto" required value={i19.anac1} onChange={(v) => patch19({ anac1: v.replace(/\D/g, "").slice(0, 8) })} onHelp={() => onHelp("anac1")} />
        <FplInputRow label="Cód. ANAC 2º Piloto" value={i19.anac2} onChange={(v) => patch19({ anac2: v.replace(/\D/g, "").slice(0, 8) })} onHelp={() => onHelp("anac2")} />
        <FplInputRow label="Telefone" required value={i19.phone} onChange={(v) => patch19({ phone: v.replace(/\D/g, "").slice(0, 13) })} onHelp={() => onHelp("phone")} />
      </div>
    </div>
  );
}

function RadioToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between border-b border-slate-200 px-4">
      <span className="text-[15px] text-slate-800">{label}</span>
      <FplToggle on={on} onChange={onChange} />
    </div>
  );
}

function Item18Modal({
  form,
  patch,
  onClose,
}: {
  form: FplPlanForm;
  patch: (partial: Partial<FplPlanForm>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(form.item18Keys);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
      <div className="max-h-[80%] w-full overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3 text-base font-semibold">Outras Informações</div>
        <div className="max-h-[52vh] overflow-y-auto">
          {FPL_ITEM18_TAGS.map((tag) => {
            const checked = draft.includes(tag.key);
            return (
              <label key={tag.key} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setDraft((prev) => (checked ? prev.filter((k) => k !== tag.key) : [...prev, tag.key]))
                  }
                />
                <span className="font-mono text-sm">{tag.label}</span>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end px-4 py-3">
          <button
            type="button"
            className="text-sm font-bold"
            style={{ color: FPL_GREEN }}
            onClick={() => {
              patch({ item18Keys: draft });
              onClose();
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailsScreen({
  form,
  planId,
  onBack,
  onEdit,
  onDelete,
  onOpenRoute,
  onOpen19,
}: {
  form: FplPlanForm;
  planId?: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenRoute: () => void;
  onOpen19: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <FplHeader
        title="Detalhes da Mensagem"
        onBack={onBack}
        right={
          <button type="button" className="px-3 text-sm" onClick={onEdit}>
            Editar
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <FplSection>Campo 13</FplSection>
        <FplRow label="Aeródromo de Partida" required value={form.depAd} />
        <FplRow label="Hora" required value={displayTime(form.depTime)} />
        <FplSection>Campo 16</FplSection>
        <FplRow label="Aeródromo de Destino" required value={form.destAd} />
        <FplRow label="EET Total" required value={displayTime(form.eet)} />
        <FplRow label="Aeródromo Altn." required value={form.altn} />
        <FplRow label="2º Aeródromo Altn." value={form.altn2} />
        <FplSection>Campo 15</FplSection>
        <FplRow label="Velocidade de Cruzeiro" required value={form.cruiseSpeed} />
        <FplRow label="Nível" required value={form.level} />
        <FplRow label="Rota" required value={form.route} chevron onClick={onOpenRoute} />
        <FplSection>Campo 18</FplSection>
        <FplRow label="DOF/" value={form.dof} />
        {form.item18Keys.map((key) => (
          <FplRow key={key} label={`${key}/`} value={form.item18[key]} />
        ))}
        <FplSection>Campo 19</FplSection>
        <FplRow label="Informações Suplementares" required chevron onClick={onOpen19} />
        {planId ? (
          <button type="button" className="mx-4 mt-4 w-[calc(100%-2rem)] rounded border border-red-200 py-2 text-sm text-red-600" onClick={onDelete}>
            Excluir plano de estudo
          </button>
        ) : null}
      </div>
    </div>
  );
}

function HelpScreen({
  title,
  mcaRef,
  body,
  tip,
  onBack,
}: {
  fieldId: string;
  title: string;
  mcaRef: string;
  body: string;
  tip?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <FplHeader title="Ajuda MCA" onBack={onBack} />
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: FPL_BLUE }}>
          {mcaRef}
        </p>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{body}</p>
        {tip ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="text-[11px] font-bold uppercase tracking-wide">Pro-tip da escola</div>
            <p className="mt-1 leading-5">{tip}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResultScreen({
  issues,
  preview,
  onBack,
  onFix,
}: {
  issues: FplValidationIssue[];
  preview: string;
  onBack: () => void;
  onFix: (fieldId: string) => void;
}) {
  const errors = issues.filter((item) => item.severity === "error");
  const warnings = issues.filter((item) => item.severity === "warning");
  const ok = errors.length === 0;
  return (
    <div className="flex h-full flex-col">
      <FplHeader title={ok ? "Validado" : "Pendências"} onBack={onBack} />
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className={`rounded-xl p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
          {ok
            ? "Preenchimento sintático ok para estudo. Isso não substitui a validação do FPL-BR/CGNA e não envia o plano."
            : `${errors.length} erro(s) segundo a MCA 100-11. Corrija e valide de novo.`}
        </div>
        {errors.map((item) => (
          <button key={`${item.fieldId}-${item.message}`} type="button" className="w-full rounded-lg border border-red-200 bg-white p-3 text-left" onClick={() => onFix(item.fieldId)}>
            <div className="text-xs font-semibold text-red-600">{item.mcaRef}</div>
            <div className="mt-1 text-sm text-slate-800">{item.message}</div>
          </button>
        ))}
        {warnings.map((item) => (
          <button key={`${item.fieldId}-${item.message}`} type="button" className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-left" onClick={() => onFix(item.fieldId)}>
            <div className="text-xs font-semibold text-amber-700">Aviso · {item.mcaRef}</div>
            <div className="mt-1 text-sm text-slate-800">{item.message}</div>
          </button>
        ))}
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-emerald-200">{preview}</pre>
      </div>
    </div>
  );
}
