import { useEffect, useMemo, useState } from "react";
import type {
  AiswebAirportBundle,
  AiswebRotaer,
} from "../types/aisweb";
import { airportSummaryFromBundle } from "../lib/flightPlanFormat";
import type {
  FlightBriefingAiContact,
  FlightBriefingAiReport,
  FlightBriefingAiTask,
  FlightBriefingAiTaskStatus,
} from "../types/flightBriefingAi";

const loadingGif =
  "data:image/gif;base64,R0lGODlhEAAQAPIAAP///wAAAMfHx2ZmZgAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJCgAAACwAAAAAEAAQAAADLwi63P4wykmrvTjrzbv/YCiOZGmeaKqubOu+cCzPdG3feK7vfO8H4AhAQA7";

const btn =
  "inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

const copyIconBtn =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-400 transition hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100";

function statusLabel(status: FlightBriefingAiTaskStatus): string {
  if (status === "done") return "feito";
  if (status === "inactive") return "inativo";
  return "pendente";
}

function actionLabel(task: FlightBriefingAiTask): string {
  if (task.action === "phone") return "ligar";
  if (task.action === "email") return "email";
  if (task.action === "url") return "abrir link";
  return "manual";
}

function contactHref(contact: FlightBriefingAiContact): string | null {
  if (contact.type === "phone") return `tel:${contact.value.replace(/[^\d+]/g, "")}`;
  if (contact.type === "website") return contact.value;
  if (contact.type === "email") return `mailto:${contact.value}`;
  return null;
}

function emailSubject(task: FlightBriefingAiTask): string {
  return `Confirmação operacional ${task.airportIcao || ""}`.trim();
}

function providerGroupKey(label: string, icao?: string): string {
  let s = String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const code = String(icao || "").toLowerCase();
  if (code) s = s.replace(new RegExp(`\\b${code}\\b`, "g"), " ");
  if (/petrobras|marlim/.test(s)) return "petrobras";
  if (/\bshell\b/.test(s)) return "shell";
  if (/jet\s*fly|jetfly/.test(s)) return "jetfly";
  if (/air\s*bp|airbp/.test(s) || s === "air bp") return "airbp";
  if (/helpjet/.test(s)) return "helpjet";
  if (/ceu\s*azul/.test(s)) return "ceu azul";
  if (/gm\s*aviation/.test(s)) return "gm aviation";
  if (/waas/.test(s)) return "waas";
  if (/rede\s*voa|\bvoa\b/.test(s)) return "rede voa";
  s = s
    .replace(
      /\b(administracao|administrativo|administradora|operacional|operacoes|ops|contato|email|telefone|phone|website|site|fbo|setor|departamento|coordenacao|atendimento|geral|local|revenda)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (s.includes("aeroclube")) return `aeroclube ${s.replace(/aeroclube/g, "").trim()}`.trim();
  return s;
}

function preferredProviderTitle(label: string, icao?: string): string {
  const raw = String(label || "").trim();
  if (/rede\s*voa|voa/i.test(raw)) return `Rede VOA${icao ? ` ${icao}` : ""}`.trim();
  if (/air\s*bp|airbp/i.test(raw)) return "AIRBP";
  if (/petrobras|marlim/i.test(raw)) return "Petrobras";
  if (/\bshell\b/i.test(raw)) return "Shell";
  if (/jet\s*fly|jetfly/i.test(raw)) return "Jet Fly";
  if (/w\.?a\.?a\.?s|waas/i.test(raw)) return "W.A.A.S. Avionics";
  if (/helpjet/i.test(raw)) return "HelpJet";
  if (/ceu\s*azul/i.test(raw)) return "Ceu Azul";
  if (/gm\s*aviation/i.test(raw)) return "GM Aviation H24";
  return raw;
}

function phoneTail(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(-8);
}

function contactTypeLabel(type: FlightBriefingAiContact["type"]): string {
  if (type === "phone") return "Telefone";
  if (type === "website") return "Site";
  if (type === "hours") return "Horário";
  return "Email";
}

function isFuelSupplierLabel(label: string): boolean {
  return /petrobras|marlim|shell|jet\s*fly|jetfly|air\s*bp|airbp|helpjet|raizen|br\s*aviation|ceu\s*azul|gm\s*aviation|combust|abastec|fuel|querosene|avgas/.test(
    String(label || "").toLowerCase(),
  );
}

function isAdminAuxLabel(label: string): boolean {
  return /administra|infraero|torre|ais\b|afis|centro\s*de\s*opera/.test(String(label || "").toLowerCase());
}

function IconCopy() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h7.5A1.5 1.5 0 0 1 17 4.5V12a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 12V4.5Z" />
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H5v6.5A2.5 2.5 0 0 0 7.5 15H14v.5A1.5 1.5 0 0 1 12.5 17h-8A1.5 1.5 0 0 1 3 15.5v-8Z" />
    </svg>
  );
}

type UnifiedProvider = {
  key: string;
  title: string;
  contacts: FlightBriefingAiContact[];
  relevance: "relevant" | "auxiliary";
};

function inferProviderRelevance(
  label: string,
  contacts: FlightBriefingAiContact[],
  task?: FlightBriefingAiTask,
): "relevant" | "auxiliary" {
  const desc = `${task?.title || ""} ${task?.description || ""}`;
  const isFuelTask = /combust|abastec|avgas|jet\s*a|airbp|petrobras|shell|jet\s*fly/i.test(`${task?.title || ""} ${desc}`);

  if (isAdminAuxLabel(label) && !isFuelSupplierLabel(label)) return "auxiliary";
  if (contacts.some((c) => c.relevance === "auxiliary") && isAdminAuxLabel(label)) return "auxiliary";

  if (isFuelTask) {
    if (isFuelSupplierLabel(label) || contacts.some((c) => c.type === "hours")) return "relevant";
    if (contacts.some((c) => c.relevance === "relevant" && (c.type === "phone" || c.type === "hours"))) {
      // keep relevant if contact itself marked; admin labels already handled
      if (!isAdminAuxLabel(label)) return "relevant";
    }
    // Extract brand-owned phones from description sections
    const brandKeys = ["petrobras", "shell", "jetfly", "airbp", "ceuazul", "gmaviation"];
    const labelKey = providerGroupKey(label, task?.airportIcao);
    if (brandKeys.includes(labelKey)) return "relevant";
    return "auxiliary";
  }

  if (contacts.some((c) => c.relevance === "relevant")) return "relevant";
  if (/airbp|rede\s*voa|\bvoa\b|waas|helpjet|fbo|hangar|combust|abastec|avgas|aeroclube|autoriza|slot|ppr|formul|concession/i.test(`${label} ${desc}`.toLowerCase())) {
    return "relevant";
  }
  return "auxiliary";
}

function taskServiceCategory(task?: FlightBriefingAiTask): "fuel" | "hangarage" | "auth" | "" {
  const text = `${task?.title || ""} ${task?.description || ""} ${task?.url || ""}`.toLowerCase();
  if (/notam/.test(text)) return "";
  // Auth before hangar — CCR RMKs mention "pátio" but are not hangaragem.
  if (/slot|ppr|autoriza|formul|rede\s*voa|agendamento\s+rede\s+voa|concession|webapp|ccr|\bauth\b|compuls|anteced/.test(text)) {
    return "auth";
  }
  if (/combust|abastec|avgas|jet\s*a|querosene/.test(text)) return "fuel";
  if (/hangar|pernoite|estadia|fbo|estacionamento/.test(text)) return "hangarage";
  if (/p[aá]tio/.test(text) && !/autoriza|concession|webapp|ccr|\bauth\b|compuls/.test(text)) return "hangarage";
  return "";
}

function expandProviderContacts(contacts: FlightBriefingAiContact[]): FlightBriefingAiContact[] {
  const out: FlightBriefingAiContact[] = [];
  const seen = new Set<string>();
  for (const contact of contacts) {
    if (contact.type !== "phone") {
      const key = `${contact.type}:${contact.value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(contact);
      continue;
    }
    // Split concatenated phone lists ("a / b / c") into one contact per number.
    const parts = String(contact.value || "")
      .split(/\s*(?:\/|,|;|\||\bou\b)\s*/i)
      .map((part) => part.trim())
      .filter(Boolean);
    const phones = (parts.length > 1 ? parts : [contact.value])
      .map((part) => {
        const match = part.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
        return match ? match[0].trim() : "";
      })
      .filter((phone) => phone.replace(/\D/g, "").length >= 10);
    for (const phone of phones.length ? phones : [contact.value]) {
      const key = `phone:${phoneTail(phone)}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...contact, type: "phone", value: phone });
    }
  }
  return out;
}

function providerFitsTaskService(label: string, contact: FlightBriefingAiContact, category: string): boolean {
  const blob = `${label} ${contact.label} ${contact.value}`.toLowerCase();
  if (category === "fuel") {
    if (contact.type === "hours") return true;
    if (isAdminAuxLabel(label) && !isFuelSupplierLabel(label)) return false;
    return isFuelSupplierLabel(label) || /combust|abastec|avgas|jetfly|querosene|airbp|shell|petrobras|marlim|helpjet|fuel/.test(blob);
  }
  if (category === "hangarage") {
    if (isFuelSupplierLabel(label) && !/hangar|fbo|waas/.test(blob)) return false;
    return /hangar|fbo|waas|pernoite|estadia|estacionamento/.test(blob);
  }
  if (category === "auth") {
    if (isFuelSupplierLabel(label) || /hangar|fbo|waas|combust|abastec|shell|petrobras|jet\s*fly/.test(blob)) return false;
    if (contact.type === "hours") return false;
    return /concession|rede\s*voa|\bvoa\b|webapp|ccr|forms\.office|ccraeroportos|autoriza|ppr|slot|formul/.test(blob);
  }
  return true;
}

function unifyProviders(task: FlightBriefingAiTask): UnifiedProvider[] {
  const icao = task.airportIcao || "";
  const category = taskServiceCategory(task);
  const raw = expandProviderContacts(
    (task.providers?.length ? task.providers : task.contact ? [task.contact] : []).filter(
      (provider, index, list) =>
        list.findIndex((item) => item.type === provider.type && item.value === provider.value) === index,
    ),
  ).filter((provider) => !category || providerFitsTaskService(provider.label, provider, category));

  const groups: UnifiedProvider[] = [];
  const byPhone = new Map<string, UnifiedProvider>();
  const byEmail = new Map<string, UnifiedProvider>();
  const byOrg = new Map<string, UnifiedProvider>();

  const findOrgOverlap = (orgKey: string, label: string): UnifiedProvider | undefined => {
    if (!orgKey) return undefined;
    if (byOrg.has(orgKey)) return byOrg.get(orgKey);
    // Never soft-merge distinct fuel brands (Petrobras/Shell/Jet Fly).
    if (isFuelSupplierLabel(label)) return undefined;
    for (const [key, group] of byOrg) {
      if (!key) continue;
      if (isFuelSupplierLabel(group.title)) continue;
      if (key.includes(orgKey) || orgKey.includes(key)) return group;
      const a = new Set(key.split(" "));
      const b = keyTokens(orgKey);
      const shared = b.filter((t) => a.has(t) && t.length >= 3);
      if (shared.length >= 1 && (key.includes("voa") || orgKey.includes("voa") || shared.some((t) => t.length >= 4))) {
        return group;
      }
    }
    return undefined;
  };

  const keyTokens = (value: string) => value.split(" ").filter(Boolean);

  for (const contact of raw) {
    const orgKey = providerGroupKey(contact.label, icao);
    const pTail = contact.type === "phone" ? phoneTail(contact.value) : "";
    const emailKey = contact.type === "email" ? contact.value.toLowerCase() : "";

    let group =
      (pTail && pTail.length >= 8 ? byPhone.get(pTail) : undefined) ||
      (emailKey ? byEmail.get(emailKey) : undefined) ||
      findOrgOverlap(orgKey, contact.label);

    if (!group) {
      group = {
        key: orgKey || `${contact.type}:${contact.value}`,
        title: preferredProviderTitle(contact.label, icao),
        contacts: [],
        relevance: "auxiliary",
      };
      groups.push(group);
      if (orgKey) byOrg.set(orgKey, group);
    } else if (orgKey && !byOrg.has(orgKey)) {
      byOrg.set(orgKey, group);
    }

    if (!group.contacts.some((c) => c.type === contact.type && c.value === contact.value)) {
      group.contacts.push(contact);
    }
    const preferred = preferredProviderTitle(contact.label, icao);
    if (/rede voa|airbp|waas|helpjet/i.test(preferred) || preferred.length >= group.title.length) {
      if (!/helpjet/i.test(preferred) || !/airbp/i.test(group.title)) group.title = preferred;
    }
    if (pTail && pTail.length >= 8) byPhone.set(pTail, group);
    if (emailKey) byEmail.set(emailKey, group);
  }

  // Collapse duplicate org variants that ended as separate groups but share phones/emails.
  const collapsed: UnifiedProvider[] = [];
  const seen = new Set<UnifiedProvider>();
  for (const group of groups) {
    if (seen.has(group)) continue;
    let target = group;
    for (const other of groups) {
      if (other === target || seen.has(other)) continue;
      const sharedPhone = target.contacts.some(
        (a) => a.type === "phone" && other.contacts.some((b) => b.type === "phone" && phoneTail(a.value) === phoneTail(b.value)),
      );
      const sharedEmail = target.contacts.some(
        (a) => a.type === "email" && other.contacts.some((b) => b.type === "email" && a.value.toLowerCase() === b.value.toLowerCase()),
      );
      const sameOrg =
        providerGroupKey(target.title, icao) &&
        providerGroupKey(target.title, icao) === providerGroupKey(other.title, icao);
      if (sharedPhone || sharedEmail || sameOrg) {
        // Never collapse distinct fuel brands into one card.
        if (
          isFuelSupplierLabel(target.title) &&
          isFuelSupplierLabel(other.title) &&
          providerGroupKey(target.title, icao) !== providerGroupKey(other.title, icao)
        ) {
          continue;
        }
        for (const c of other.contacts) {
          if (!target.contacts.some((x) => x.type === c.type && x.value === c.value)) target.contacts.push(c);
        }
        if (/rede voa|airbp|waas|petrobras|shell|jet fly/i.test(other.title)) target.title = preferredProviderTitle(other.title, icao);
        seen.add(other);
      }
    }
    target.relevance = inferProviderRelevance(target.title, target.contacts, task);
    collapsed.push(target);
    seen.add(target);
  }

  return collapsed.sort((a, b) => {
    const ra = a.relevance === "relevant" ? 0 : 1;
    const rb = b.relevance === "relevant" ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return a.title.localeCompare(b.title, "pt-BR");
  });
}

function sortAirportTasks(tasks: FlightBriefingAiTask[]): FlightBriefingAiTask[] {
  return [...tasks].sort((a, b) => {
    const aNotam = /notam/i.test(`${a.title} ${a.description}`) ? 0 : 1;
    const bNotam = /notam/i.test(`${b.title} ${b.description}`) ? 0 : 1;
    if (aNotam !== bNotam) return aNotam - bNotam;
    const rank = (t: FlightBriefingAiTask) => {
      const text = `${t.title} ${t.description}`.toLowerCase();
      if (/autoriza|slot|ppr|formul|agendamento\s+rede\s+voa|compuls|\bauth\b|ccr/.test(text)) return 1;
      if (/combust|abastec/.test(text)) return 2;
      if (/hangar|pernoite/.test(text)) return 3;
      return 4;
    };
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const pr = { high: 0, medium: 1, low: 2 } as const;
    return (pr[a.priority] ?? 9) - (pr[b.priority] ?? 9);
  });
}

function airportGroupLabel(icao: string): string {
  return icao === "ROTA" ? "Rota" : icao;
}

function formatWorkingScheduleShort(rotaer: AiswebRotaer | null | undefined): string {
  const schedules = rotaer?.workingHours?.schedules || [];
  if (schedules.length) {
    return schedules
      .map((s) => {
        const days = s.days.join("/") || "-";
        const hours = s.begin && s.end ? `${s.begin}-${s.end}` : "-";
        return `${days} ${hours}`;
      })
      .join(" | ");
  }
  return rotaer?.workingHours?.text || "-";
}

function formatFuelShort(rotaer: AiswebRotaer | null | undefined): string {
  const fuel = rotaer?.fuel;
  if (!fuel) return "-";
  const types = fuel.types?.length ? fuel.types.join(" | ") : fuel.text || "-";
  return fuel.hours ? `${types} | ${fuel.hours}` : types;
}

function formatRunwaysShort(rotaer: AiswebRotaer | null | undefined): string {
  const runways = rotaer?.runways || [];
  if (!runways.length) return "-";
  return runways
    .map((rwy) => {
      const size =
        rwy.lengthM != null && rwy.widthM != null
          ? `${rwy.lengthM.toLocaleString("pt-BR")} x ${rwy.widthM} m`
          : rwy.lengthM != null
            ? `${rwy.lengthM.toLocaleString("pt-BR")} m`
            : "-";
      const surface = (rwy.surfaceLabel || rwy.surface || "").trim();
      return surface ? `${rwy.ident} - ${size} | ${surface}` : `${rwy.ident} - ${size}`;
    })
    .join(" | ");
}

function TaskNoteTextarea({
  task,
  onTaskUpdate,
}: {
  task: FlightBriefingAiTask;
  onTaskUpdate: (taskId: string, patch: { pilotNote?: string }) => void;
}) {
  const [draft, setDraft] = useState(task.pilotNote || "");

  useEffect(() => {
    setDraft(task.pilotNote || "");
  }, [task.id, task.pilotNote]);

  return (
    <textarea
      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600"
      rows={3}
      value={draft}
      placeholder="Observação do piloto..."
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== (task.pilotNote || "")) onTaskUpdate(task.id, { pilotNote: draft });
      }}
    />
  );
}

function CopyableValue({
  label,
  value,
  href,
  onCopy,
  multiline = false,
  copyable = true,
}: {
  label: string;
  value: string;
  href?: string | null;
  onCopy: (text: string, label: string) => void;
  multiline?: boolean;
  copyable?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className={`mt-0.5 flex items-start gap-1.5 ${multiline ? "flex-col" : ""}`}>
        {href ? (
          <a
            className={`min-w-0 break-all text-xs text-cyan-300 hover:text-cyan-200 ${multiline ? "whitespace-pre-wrap" : "font-mono"}`}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noreferrer" : undefined}
          >
            {value}
          </a>
        ) : (
          <p className={`min-w-0 break-all text-xs text-slate-200 ${multiline ? "whitespace-pre-wrap" : "font-mono"}`}>
            {value}
          </p>
        )}
        {copyable ? (
          <button
            type="button"
            className={`${copyIconBtn} mt-px shrink-0`}
            title={`Copiar ${label}`}
            aria-label={`Copiar ${label}`}
            onClick={() => onCopy(value, label)}
          >
            <IconCopy />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TaskDetailModal({
  task,
  onClose,
  onTaskUpdate,
  onCopy,
  onOpenAirportNotams,
}: {
  task: FlightBriefingAiTask;
  onClose: () => void;
  onTaskUpdate: (taskId: string, patch: { status?: FlightBriefingAiTaskStatus; pilotNote?: string }) => void;
  onCopy: (text: string, label: string) => void;
  onOpenAirportNotams?: (icao: string, notamNumber?: string) => void;
}) {
  const providers = unifyProviders(task);
  const isNotamTask = /notam/i.test(`${task.title} ${task.description}`);
  const subject = task.action === "email" ? emailSubject(task) : "";
  const body = task.action === "email" ? task.suggestedText || "" : "";
  const looseUrl = task.url && !providers.some((p) => p.contacts.some((c) => c.value === task.url)) ? task.url : "";

  return (
    <div className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">{task.airportIcao || "Rota"}</p>
            <h3 className="text-base font-semibold text-slate-100">{task.title}</h3>
            <p className="mt-1 text-xs text-slate-500">{statusLabel(task.status)} · {actionLabel(task)}</p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-300">{task.description}</p>
        {task.dueHint ? <p className="mt-2 text-xs text-amber-200">Prazo: {task.dueHint}</p> : null}
        {Array.isArray(task.highlights) && task.highlights.length ? (
          <div className="mt-3 grid gap-2">
            {task.highlights.map((item) => (
              <article
                key={item}
                className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-100"
              >
                {item}
              </article>
            ))}
          </div>
        ) : null}
        {isNotamTask && task.airportIcao && onOpenAirportNotams ? (
          <button
            type="button"
            className={`${btn} mt-3 border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20`}
            onClick={() => {
              onOpenAirportNotams(task.airportIcao || "");
              onClose();
            }}
          >
            Abrir NOTAMs do aeródromo
          </button>
        ) : null}

        {providers.length ? (
          <div className="mt-3 grid gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Fornecedores / contatos</p>
            {providers.map((provider) => (
              <article key={provider.key} className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-xs font-semibold text-slate-100">{provider.title}</p>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      provider.relevance === "relevant"
                        ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                        : "border border-slate-600/60 bg-slate-800/80 text-slate-400"
                    }`}
                  >
                    {provider.relevance === "relevant" ? "Relevante" : "Auxiliar"}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {[...provider.contacts]
                    .sort((a, b) => {
                      const order = { hours: 0, phone: 1, email: 2, website: 3 } as const;
                      return (order[a.type] ?? 9) - (order[b.type] ?? 9);
                    })
                    .map((contact) => (
                    <CopyableValue
                      key={`${contact.type}-${contact.value}`}
                      label={contactTypeLabel(contact.type)}
                      value={contact.value}
                      href={contactHref(contact)}
                      onCopy={onCopy}
                      copyable={contact.type === "phone" || contact.type === "email" || contact.type === "website"}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {looseUrl ? (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            <CopyableValue label="Link" value={looseUrl} href={looseUrl} onCopy={onCopy} />
          </div>
        ) : null}

        {subject || body ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            {subject ? <CopyableValue label="Assunto" value={subject} onCopy={onCopy} /> : null}
            {body ? <CopyableValue label="Corpo" value={body} onCopy={onCopy} multiline /> : null}
          </div>
        ) : null}

        {task.suggestedText && task.action !== "email" ? (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            <CopyableValue label="Texto" value={task.suggestedText} onCopy={onCopy} multiline />
          </div>
        ) : null}

        <TaskNoteTextarea task={task} onTaskUpdate={onTaskUpdate} />

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => onTaskUpdate(task.id, { status: task.status === "done" ? "open" : "done" })}
          >
            {task.status === "done" ? "Voltar para pendente" : "Marcar feito"}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => onTaskUpdate(task.id, { status: task.status === "inactive" ? "open" : "inactive" })}
          >
            {task.status === "inactive" ? "Reativar" : "Inativar"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TaskCard({
  task,
  onOpen,
  onTaskUpdate,
}: {
  task: FlightBriefingAiTask;
  onOpen: (task: FlightBriefingAiTask) => void;
  onTaskUpdate: (taskId: string, patch: { status?: FlightBriefingAiTaskStatus }) => void;
}) {
  const done = task.status === "done";
  const inactive = task.status === "inactive";

  return (
    <article
      className={`cursor-pointer rounded-lg border p-2.5 transition hover:border-cyan-500/45 hover:bg-slate-900/80 ${
        done
          ? "border-emerald-500/35 bg-emerald-500/10"
          : inactive
            ? "border-slate-800 bg-slate-950/30 opacity-60"
            : "border-slate-800 bg-slate-950/60"
      }`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(task);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0"
          checked={done}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onTaskUpdate(task.id, { status: event.target.checked ? "done" : "open" })}
          aria-label={`Marcar ${task.title}`}
        />
        <div className="min-w-0 flex-1 text-left">
          <span className={`block text-xs font-semibold leading-4 ${done ? "text-emerald-100 line-through decoration-emerald-300/80" : "text-slate-100"}`}>
            {task.title}
          </span>
          <span className="hidden">
            {statusLabel(task.status)} · {actionLabel(task)}
          </span>
        </div>
      </div>
    </article>
  );
}

type BriefingAirportDoc = {
  role: "origem" | "destino" | "alternativo";
  icao: string;
  bundle: AiswebAirportBundle;
  note?: string;
};

function airportRoleLabel(role: BriefingAirportDoc["role"]): string {
  if (role === "origem") return "Origem";
  if (role === "destino") return "Destino";
  return "Alternativo";
}

export function FlightBriefingAiPanel({
  report,
  loading,
  error,
  onTaskUpdate,
  onCopy,
  airports = [],
  onAirportNoteChange,
  onOpenAirportNotams,
}: {
  report: FlightBriefingAiReport | null;
  loading: boolean;
  error: string | null;
  onTaskUpdate: (taskId: string, patch: { status?: FlightBriefingAiTaskStatus; pilotNote?: string }) => void;
  onCopy: (text: string, label: string) => void;
  airports?: BriefingAirportDoc[];
  onAirportNoteChange?: (role: BriefingAirportDoc["role"], icao: string, note: string) => void;
  onOpenAirportNotams?: (icao: string, notamNumber?: string) => void;
}) {
  const [selectedTask, setSelectedTask] = useState<FlightBriefingAiTask | null>(null);
  const tasksByIcao = useMemo(() => {
    const map = new Map<string, FlightBriefingAiTask[]>();
    for (const task of report?.tasks || []) {
      const key = task.airportIcao || "ROTA";
      map.set(key, [...(map.get(key) || []), task]);
    }
    for (const [key, list] of map) {
      map.set(key, sortAirportTasks(list));
    }
    return map;
  }, [report]);
  const airportRows = useMemo<Array<{ icao: string; airport: BriefingAirportDoc | null }>>(() => {
    const seen = new Set<string>();
    const rows: Array<{ icao: string; airport: BriefingAirportDoc | null }> = airports.map((airport) => {
      seen.add(airport.icao);
      return { icao: airport.icao, airport };
    });
    for (const [icao] of tasksByIcao) {
      if (icao !== "ROTA" && !seen.has(icao)) rows.push({ icao, airport: null });
    }
    if (tasksByIcao.has("ROTA")) rows.push({ icao: "ROTA", airport: null });
    return rows;
  }, [airports, tasksByIcao]);

  useEffect(() => {
    if (!selectedTask) return;
    const updated = report?.tasks.find((task) => task.id === selectedTask.id);
    if (updated) setSelectedTask(updated);
  }, [report, selectedTask?.id]);

  if (loading) {
    return (
      <section className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
        <img src={loadingGif} alt="" className="h-10 w-10 rounded-lg border border-cyan-400/30 bg-slate-950 p-1" />
        <div>
          <p className="text-sm font-semibold text-cyan-100">IA pesquisando contatos e pendências.</p>
          <p className="mt-1 text-xs text-cyan-200/70">Pode levar mais de 30 segundos.</p>
        </div>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="text-sm font-semibold text-slate-200">Checklist IA ainda não gerado.</p>
        {error ? <p className="mt-1 text-xs text-amber-200">{error}</p> : null}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{error}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Checklist IA</h3>
          <p className="text-xs text-slate-500">
            {report.tasks.filter((task) => task.status === "open").length} pendente(s) · {report.tasks.filter((task) => task.status === "done").length} feita(s)
          </p>
        </div>
        <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-400">
          {report.status === "fallback" ? "fallback" : "IA pronta"}
        </span>
      </div>

      {airportRows.length === 0 ? <p className="text-xs text-slate-500">Nenhuma tarefa sugerida.</p> : null}
      <section className="grid gap-3 @lg:grid-cols-3">
        {airportRows.map(({ icao, airport }) => {
          const tasks = tasksByIcao.get(icao) || [];
          const aiAirport = report.airports.find((item) => item.icao === icao);
          const summary = airport
            ? airportSummaryFromBundle(airportRoleLabel(airport.role), airport.icao, airport.bundle)
            : null;
          const rotaer = airport?.bundle.rotaer || null;
          const metar = airport?.bundle.met?.metar?.trim() || "";
          const taf = airport?.bundle.met?.taf?.trim() || "";
          return (
          <div key={icao} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  {airport ? airportRoleLabel(airport.role) : "Checklist"}
                </p>
                <h4 className="text-base font-semibold text-slate-100">{airportGroupLabel(icao)}</h4>
                {summary?.name ? <p className="text-xs text-slate-500">{summary.name}</p> : null}
              </div>
              <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
                {tasks.filter((task) => task.status === "open").length} pend.
              </span>
            </div>

            {airport ? (
              <div className="mt-3 space-y-1.5">
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    ["Tipo", rotaer?.typeOpr || "-"],
                    ["Uso", rotaer?.typeUtil || "-"],
                    ["Elev.", rotaer?.altFt != null ? `${rotaer.altFt.toLocaleString("pt-BR")} ft` : "-"],
                    ["Comb.", formatFuelShort(rotaer)],
                    ["Horário", formatWorkingScheduleShort(rotaer)],
                    ["Sol", airport.bundle.sun?.sunriseUtc || airport.bundle.sun?.sunsetUtc ? `${airport.bundle.sun?.sunriseUtc || "-"}Z / ${airport.bundle.sun?.sunsetUtc || "-"}Z` : "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-md border border-slate-800 bg-slate-900/45 px-2 py-1.5">
                      <p className="text-[9px] text-slate-500">{label}</p>
                      <p className="truncate text-[11px] font-semibold text-slate-200">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-900/45 px-2 py-1.5">
                  <p className="text-[9px] text-slate-500">Pistas</p>
                  <p className="line-clamp-2 text-[11px] font-semibold text-slate-200">{formatRunwaysShort(rotaer)}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="rounded-md border border-slate-800 bg-slate-900/45 px-2 py-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">METAR</p>
                    <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-slate-300">{metar || "-"}</p>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-900/45 px-2 py-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">TAF</p>
                    <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-slate-300">{taf || "-"}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {aiAirport ? (
              <details className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2">
                <summary className="cursor-pointer text-xs font-semibold text-cyan-100">Insights IA</summary>
                <div className="mt-2 space-y-2 text-xs text-cyan-50/85">
                  <p><span className="font-semibold">Combustível:</span> {aiAirport.fuel.detail}</p>
                  <p><span className="font-semibold">Hangaragem:</span> {aiAirport.hangarage.detail}</p>
                  <p><span className="font-semibold">Slot/PPR:</span> {aiAirport.slotPpr.detail}</p>
                </div>
              </details>
            ) : null}

            {airport && onAirportNoteChange ? (
              <label className="mt-2 block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Observações</span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600"
                  rows={2}
                  value={airport.note || ""}
                  placeholder="Anotação manual..."
                  onChange={(event) => onAirportNoteChange(airport.role, airport.icao, event.target.value)}
                />
              </label>
            ) : null}

            <div className="mt-3 space-y-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={setSelectedTask}
                onTaskUpdate={onTaskUpdate}
              />
            ))}
            </div>
          </div>
          );
        })}
      </section>

      {report.sources.length ? (
        <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-100">Fontes</summary>
          <div className="mt-2 grid gap-2">
            {report.sources.slice(0, 12).map((source) => (
              <a key={source.id} href={source.url || "#"} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-800 bg-slate-900/45 px-3 py-2 text-xs text-slate-300 hover:border-cyan-500/40">
                <span className="font-semibold text-slate-100">{source.title}</span>
                {source.url ? <span className="mt-1 block break-all font-mono text-[10px] text-slate-500">{source.url}</span> : null}
              </a>
            ))}
          </div>
        </details>
      ) : null}

      {selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onTaskUpdate={onTaskUpdate}
          onCopy={onCopy}
          onOpenAirportNotams={onOpenAirportNotams}
        />
      ) : null}
    </div>
  );
}
