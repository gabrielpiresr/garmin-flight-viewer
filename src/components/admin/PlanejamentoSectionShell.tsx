import type { ReactNode } from "react";
import { Tabs } from "../ui/Tabs";

export type PlanejamentoSectionId =
  | "map"
  | "route"
  | "view3d"
  | "alternates"
  | "airspace"
  | "briefing";

function IconBack() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path
        fillRule="evenodd"
        d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconMap() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path
        fillRule="evenodd"
        d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconRoute() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M4.5 3.5a2 2 0 114 0 2 2 0 01-4 0zM11.5 14.5a2 2 0 114 0 2 2 0 01-4 0z" />
      <path
        fillRule="evenodd"
        d="M7.03 5.97a.75.75 0 011.06 0l5.94 5.94a.75.75 0 11-1.06 1.06L7.03 7.03a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
      <path d="M3 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zM12 7.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" />
    </svg>
  );
}

function IconView3d() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M10 1.5L2.5 5.25v9.5L10 18.5l7.5-3.75v-9.5L10 1.5zm0 1.732l5.5 2.75L10 8.732 4.5 5.982 10 3.232zM4 7.268l5.25 2.625v6.37L4 13.637V7.268zm7.25 8.995v-6.37L16.5 7.268v6.37l-5.25 2.625z" />
    </svg>
  );
}

function IconAlternates() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M10.75 1.75a.75.75 0 00-1.5 0V5H6.5a.75.75 0 000 1.5h2.75v3.25a.75.75 0 001.5 0V6.5H13.5a.75.75 0 000-1.5h-2.75V1.75z" />
      <path d="M3.5 11.75a.75.75 0 01.75-.75h11.5a.75.75 0 010 1.5H4.25a.75.75 0 01-.75-.75zM5.5 14.75a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM7.5 17.75a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" />
    </svg>
  );
}

function IconAirspace() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 9.75A.75.75 0 012.75 9H10a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zM2.75 14a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-5.5z" />
      <path
        fillRule="evenodd"
        d="M13.22 9.22a.75.75 0 011.06 0l3 3a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06l1.72-1.72H10.75a.75.75 0 010-1.5h4.19l-1.72-1.72a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconBriefing() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path
        fillRule="evenodd"
        d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0015.5 2h-11zM6 6.75A.75.75 0 016.75 6h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 016 6.75zM6.75 9a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM6 12.75a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const SECTION_ICONS: Record<PlanejamentoSectionId, ReactNode> = {
  map: <IconMap />,
  route: <IconRoute />,
  view3d: <IconView3d />,
  alternates: <IconAlternates />,
  airspace: <IconAirspace />,
  briefing: <IconBriefing />,
};

export const PLANEJAMENTO_SECTIONS: ReadonlyArray<{
  id: PlanejamentoSectionId;
  label: string;
  shortLabel: string;
  hint: string;
  requiresRoute?: boolean;
}> = [
  { id: "map", label: "Mapa", shortLabel: "Mapa", hint: "Mapa 2D e montagem da rota" },
  { id: "route", label: "Rota", shortLabel: "Rota", hint: "Pontos, perfil, proas, distâncias e altitudes" },
  {
    id: "view3d",
    label: "Vista 3D",
    shortLabel: "3D",
    hint: "Terreno, corredores e espaços em 3D",
    requiresRoute: true,
  },
  {
    id: "airspace",
    label: "Espaços aéreos",
    shortLabel: "Espaço",
    hint: "Espaços atravessados na altitude planejada",
    requiresRoute: true,
  },
  { id: "alternates", label: "Alternativas", shortLabel: "Alt.", hint: "Aeródromos alternativos da rota" },
  { id: "briefing", label: "Briefings", shortLabel: "Brief", hint: "Resumo, checklist e documentos" },
];

const SECTION_TITLE: Record<PlanejamentoSectionId, string> = {
  map: "Mapa",
  route: "Rota",
  view3d: "Vista 3D",
  alternates: "Alternativas",
  airspace: "Espaços aéreos",
  briefing: "Briefings",
};

export function PlanejamentoBackIcon() {
  return <IconBack />;
}

type EditorTabsProps = {
  active: PlanejamentoSectionId;
  hasRoute: boolean;
  onSelect: (id: PlanejamentoSectionId) => void;
};

export function PlanejamentoEditorTabs({ active, hasRoute, onSelect }: EditorTabsProps) {
  return (
    <Tabs
      items={PLANEJAMENTO_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        icon: SECTION_ICONS[section.id],
        disabled: Boolean(section.requiresRoute && !hasRoute),
        disabledTooltip: section.requiresRoute && !hasRoute ? "Monte a rota com pelo menos 2 pontos" : section.hint,
      }))}
      value={active}
      onChange={onSelect}
      ariaLabel="Seções do planejamento"
      accent="cyan"
    />
  );
}

export function PlanejamentoHoverButton({
  icon,
  label,
  onClick,
  disabled,
  title,
  variant = "secondary",
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "primary" | "secondary";
}) {
  const tone =
    variant === "primary"
      ? "border-emerald-500/40 bg-emerald-600 text-white hover:bg-emerald-500"
      : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 hover:bg-slate-800 hover:text-white";
  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      onClick={onClick}
      className={`group inline-flex h-9 max-w-full shrink-0 cursor-pointer items-center overflow-hidden rounded-lg border px-2.5 text-sm font-semibold transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
    >
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]">
        <span className="min-w-0 overflow-hidden">
          <span className="block whitespace-nowrap pl-0 opacity-0 transition-all duration-300 ease-out group-hover:pl-1.5 group-hover:opacity-100 group-focus-visible:pl-1.5 group-focus-visible:opacity-100">
            {label}
          </span>
        </span>
      </span>
    </button>
  );
}

export function IconPlusSmall() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
    </svg>
  );
}

export function IconSaveSmall() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3 3.5A1.5 1.5 0 014.5 2h7.086a1.5 1.5 0 011.06.44l3.914 3.914a1.5 1.5 0 01.44 1.06V16.5A1.5 1.5 0 0115.5 18h-11A1.5 1.5 0 013 16.5v-13zM5 4v4.75c0 .69.56 1.25 1.25 1.25h4.5c.69 0 1.25-.56 1.25-1.25V4H5zm0 8.5v3h10v-3H5z" />
    </svg>
  );
}

export function IconSaveAsSmall() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3 3.5A1.5 1.5 0 014.5 2h7.086a1.5 1.5 0 011.06.44l3.914 3.914a1.5 1.5 0 01.44 1.06V16.5A1.5 1.5 0 0115.5 18h-11A1.5 1.5 0 013 16.5v-13zM5 4v4.75c0 .69.56 1.25 1.25 1.25h4.5c.69 0 1.25-.56 1.25-1.25V4H5z" />
      <path d="M14.75 11.25a.75.75 0 00-1.5 0v1.5h-1.5a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5v-1.5z" />
    </svg>
  );
}

export function IconFolderSmall() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-5.586a.25.25 0 01-.177-.073l-1.414-1.414A1.75 1.75 0 007.836 3H3.75z" />
    </svg>
  );
}

type HeaderProps = {
  section: PlanejamentoSectionId;
  trailing?: ReactNode;
};

/** Thin title bar inside a focused section (navigation lives in the floating bottom nav). */
export function PlanejamentoSectionHeader({ section, trailing }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 -mx-3 mb-2 flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-2 md:-mx-4 md:px-4">
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100 sm:text-base">
        {SECTION_TITLE[section]}
      </h2>
      {trailing}
    </header>
  );
}

type FloatingNavProps = {
  active: PlanejamentoSectionId;
  hasRoute: boolean;
  onSelect: (id: PlanejamentoSectionId) => void;
  onLeave: () => void;
};

/** Replaces the admin bottom nav while Planejamento is open (tablet/phone). */
export function PlanejamentoFloatingNav({
  active,
  hasRoute,
  onSelect,
  onLeave,
}: FloatingNavProps) {
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Navegação do planejamento"
    >
      <div className="flex overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950 p-1 shadow-2xl shadow-slate-950/70">
        <button
          type="button"
          onClick={onLeave}
          className="flex min-w-[3.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
          aria-label="Voltar ao menu admin"
          title="Voltar"
        >
          <IconBack />
          <span>Voltar</span>
        </button>
        <div className="mx-0.5 w-px shrink-0 self-stretch bg-slate-800" aria-hidden />
        {PLANEJAMENTO_SECTIONS.map((section) => {
          const disabled = Boolean(section.requiresRoute && !hasRoute);
          const isActive = active === section.id;
          return (
            <button
              key={section.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(section.id)}
              title={section.label}
              className={`flex min-w-[3.75rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${
                isActive
                  ? "bg-cyan-500/15 text-cyan-300"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="h-4 w-4">{SECTION_ICONS[section.id]}</span>
              <span className="max-w-full truncate">{section.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
