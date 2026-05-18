import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOpenedTabs, useRoutedTab, type TabRoute } from "../lib/routedTabs";
import { applySchoolTheme, getSchoolRules } from "../lib/schoolRulesDb";
import { DEFAULT_SCHOOL_RULES, type SchoolRules, type StudentPortalTab } from "../types/schoolRules";
import { AgendamentoTab } from "./AgendamentoTab";
import { AlunoProfileDashboard } from "./AlunoProfileDashboard";
import { CreditosTab } from "./CreditosTab";
import { JornadaTab } from "./JornadaTab";
import { ManobrasTab } from "./ManobrasTab";
import { ManuaisTab } from "./ManuaisTab";
import { MeusVoosTab } from "./MeusVoosTab";
import { NoticeFeed } from "./NoticeFeed";
import { PushNotificationsToggle } from "./PushNotificationsToggle";
import { StudentHome } from "./StudentHome";

type Section = StudentPortalTab;

type NavItem = {
  id: Section;
  label: string;
  sublabel: string;
  icon: ReactNode;
};

const SELECTED_NAV_CLASS = "school-nav-active";

const NAV_ITEMS: NavItem[] = [
  {
    id: "home",
    label: "Home",
    sublabel: "Comunicados e próximos voos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.69-8.69a2.25 2.25 0 00-3.18 0l-8.69 8.69a.75.75 0 001.06 1.06l8.69-8.69z" />
        <path d="M12 5.432l8.159 8.159c.03.03.061.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625A1.875 1.875 0 013.75 19.875v-6.198c.03-.028.061-.056.091-.086L12 5.432z" />
      </svg>
    ),
  },
  {
    id: "jornada",
    label: "Jornada",
    sublabel: "Evolução, recordes e badges",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M5.166 2.621A.75.75 0 015.75 2.25h12.5a.75.75 0 01.584.371l1.25 2.083a3.75 3.75 0 01-2.396 5.577 6.773 6.773 0 01-4.938 4.102v2.117h2.5a.75.75 0 01.75.75v2h2.25a.75.75 0 010 1.5H5.75a.75.75 0 010-1.5H8v-2a.75.75 0 01.75-.75h2.5v-2.117a6.773 6.773 0 01-4.938-4.102 3.75 3.75 0 01-2.396-5.577l1.25-2.083zM6 4.5l-.798 1.33A2.25 2.25 0 006 9.198V4.5zm12 4.698a2.25 2.25 0 00.798-3.368L18 4.5v4.698z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "meus-voos",
    label: "Meus voos",
    sublabel: "Histórico, agenda e fichas",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
      </svg>
    ),
  },
  {
    id: "agendamento",
    label: "Agendamento",
    sublabel: "Planejamento semanal",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "creditos",
    label: "Créditos",
    sublabel: "Saldo e extrato de horas",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12 1.5a.75.75 0 01.75.75v1.534a8.25 8.25 0 11-1.5 0V2.25A.75.75 0 0112 1.5z" />
        <path d="M8.25 11.25A.75.75 0 019 10.5h6a.75.75 0 010 1.5H9a.75.75 0 01-.75-.75zM9 13.5a.75.75 0 000 1.5h3.75a.75.75 0 000-1.5H9z" />
      </svg>
    ),
  },
  {
    id: "avisos",
    label: "Avisos",
    sublabel: "Comunicados da escola",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M1.5 8.67c0-1.213.84-2.266 2.024-2.49l13.5-2.56a2.25 2.25 0 012.669 2.21v12.34a2.25 2.25 0 01-2.67 2.21l-13.5-2.56A2.532 2.532 0 011.5 15.33V8.67z" />
        <path d="M20.25 8.99a.75.75 0 011.5 0v5.02a.75.75 0 01-1.5 0V8.99z" />
      </svg>
    ),
  },
  {
    id: "manuais",
    label: "Manuais",
    sublabel: "Materiais e documentos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
      </svg>
    ),
  },
  {
    id: "manobras",
    label: "Manobras",
    sublabel: "Material de estudo",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 8.625a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM15.375 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zM7.5 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "perfil",
    label: "Perfil",
    sublabel: "Dados cadastrais e ANAC",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
      </svg>
    ),
  },
];

const SECTION_ROUTES = [
  { id: "home", path: "/aluno", aliases: ["/"] },
  { id: "jornada", path: "/aluno/jornada" },
  { id: "meus-voos", path: "/aluno/meus-voos" },
  { id: "agendamento", path: "/aluno/agendamento" },
  { id: "creditos", path: "/aluno/creditos" },
  { id: "avisos", path: "/aluno/avisos" },
  { id: "manuais", path: "/aluno/manuais" },
  { id: "manobras", path: "/aluno/manobras" },
  { id: "perfil", path: "/aluno/perfil" },
] satisfies readonly TabRoute<Section>[];

export function MainLayout() {
  const { user, signOut } = useAuth();
  const [section, setSection] = useRoutedTab(SECTION_ROUTES, "home");
  const openedSections = useOpenedTabs(section);
  const [rules, setRules] = useState<SchoolRules>(DEFAULT_SCHOOL_RULES);

  const visibleNavItems = NAV_ITEMS.filter((item) => rules.studentTabs[item.id]);
  const availableNavItems = visibleNavItems.length > 0 ? visibleNavItems : [NAV_ITEMS[0]!];
  const activeNav = availableNavItems.find((item) => item.id === section) ?? availableNavItems[0]!;

  function openSection(target: Section) {
    const targetIsAvailable = availableNavItems.some((item) => item.id === target);
    setSection(targetIsAvailable ? target : activeNav.id);
  }

  useEffect(() => {
    let cancelled = false;
    void getSchoolRules()
      .then((next) => {
        if (cancelled) return;
        setRules(next);
        applySchoolTheme(next);
      })
      .catch(() => {
        if (cancelled) return;
        setRules(DEFAULT_SCHOOL_RULES);
        applySchoolTheme(DEFAULT_SCHOOL_RULES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!availableNavItems.some((item) => item.id === section)) {
      setSection(availableNavItems[0]!.id, { replace: true });
    }
  }, [availableNavItems, section]);

  return (
    <div className="school-themed-shell flex min-h-screen">
      <aside className="school-themed-surface sticky top-0 hidden h-screen w-64 flex-col border-r border-slate-800 lg:flex">
        <div className="border-b border-slate-800 px-5 py-5">
          <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sky-400">
            Aluno
          </span>
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Portal do aluno</p>
          <p className="text-sm font-semibold text-slate-200">Operação de voo</p>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {availableNavItems.map((item) => {
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openSection(item.id)}
                className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                  isActive
                    ? SELECTED_NAV_CLASS
                    : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <span className={isActive ? "" : "opacity-60 group-hover:opacity-100"}>{item.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-none">{item.label}</p>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 px-4 py-4">
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
          <div className="school-themed-surface flex items-center justify-between gap-4 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sky-400 lg:hidden">
                Aluno
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase tracking-widest text-slate-500">
                  {activeNav.sublabel}
                </p>
                <h1 className="truncate text-base font-semibold text-slate-100">{activeNav.label}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <PushNotificationsToggle />
              <span className="hidden max-w-48 truncate text-xs text-slate-600 sm:block">{user?.email}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 lg:hidden"
              >
                Sair
              </button>
            </div>
          </div>

        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-6 lg:pb-6">
          {openedSections.has("home") && (
            <div hidden={section !== "home"}>
              <StudentHome
                onOpenFlights={() => openSection("meus-voos")}
                onOpenNotices={() => openSection("avisos")}
              />
            </div>
          )}
          {openedSections.has("jornada") && (
            <div hidden={section !== "jornada"}>
              <JornadaTab />
            </div>
          )}
          {openedSections.has("meus-voos") && (
            <div hidden={section !== "meus-voos"}>
              <MeusVoosTab />
            </div>
          )}
          {openedSections.has("agendamento") && (
            <div hidden={section !== "agendamento"}>
              <AgendamentoTab />
            </div>
          )}
          {openedSections.has("creditos") && (
            <div hidden={section !== "creditos"}>
              <CreditosTab />
            </div>
          )}
          {openedSections.has("avisos") && (
            <div hidden={section !== "avisos"}>
              <NoticeFeed className="w-full max-w-4xl" eyebrow="Avisos" title="Comunicados da escola" />
            </div>
          )}
          {openedSections.has("manuais") && (
            <div hidden={section !== "manuais"}>
              <ManuaisTab />
            </div>
          )}
          {openedSections.has("manobras") && (
            <div hidden={section !== "manobras"}>
              <ManobrasTab />
            </div>
          )}
          {openedSections.has("perfil") && (
            <div hidden={section !== "perfil"}>
              <AlunoProfileDashboard />
            </div>
          )}
        </main>

        <footer className="hidden border-t border-slate-800 px-4 py-3 text-center text-xs text-slate-600 md:px-6 lg:block">
          Uso educacional. Valide sempre com as fontes oficiais de registro de voo e procedimentos da sua escola de
          aviação.
        </footer>

        <nav className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="flex overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/95 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
            {availableNavItems.map((item) => {
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openSection(item.id)}
                  className={`flex min-w-[4.75rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition ${
                    isActive ? "school-nav-active" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <span className="h-4 w-4">{item.icon}</span>
                  <span className="max-w-full truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
