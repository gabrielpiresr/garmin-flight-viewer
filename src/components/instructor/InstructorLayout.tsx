import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import { useOpenedTabs, useRoutedTab, type TabRoute } from "../../lib/routedTabs";
import { getReferAndEarnPublic, programConfigForRole } from "../../lib/referAndEarnDb";
import { getOnboardingPublic } from "../../lib/onboardingDb";
import { ScheduleAdminTab, type ScheduleSubTab } from "../admin/ScheduleAdminTab";
import { DiarioDeBordoTab } from "../admin/DiarioDeBordoTab";
import { PortalShellHeader } from "../PortalShellHeader";
import { UserEmailWithRoleSwitcher } from "../RoleSwitcher";
import type { InstructorTabKey } from "../../types/rolePermissions";

const HelpCenterTab = lazy(() => import("../HelpCenterTab").then((module) => ({ default: module.HelpCenterTab })));
const InstructorFlightsTab = lazy(() =>
  import("./InstructorFlightsTab").then((module) => ({ default: module.InstructorFlightsTab })),
);
const InstructorHome = lazy(() => import("./InstructorHome").then((module) => ({ default: module.InstructorHome })));
const InstructorProfileTab = lazy(() =>
  import("./InstructorProfileTab").then((module) => ({ default: module.InstructorProfileTab })),
);
const FlightReportsTab = lazy(() =>
  import("../admin/FlightReportsTab").then((module) => ({ default: module.FlightReportsTab })),
);
const InstructorStudentsTab = lazy(() =>
  import("./InstructorStudentsTab").then((module) => ({ default: module.InstructorStudentsTab })),
);
const JornadaTab = lazy(() => import("../JornadaTab").then((module) => ({ default: module.JornadaTab })));
const ManobrasTab = lazy(() => import("../ManobrasTab").then((module) => ({ default: module.ManobrasTab })));
const ManuaisTab = lazy(() => import("../ManuaisTab").then((module) => ({ default: module.ManuaisTab })));
const ManuaisInternosTab = lazy(() =>
  import("../ManuaisInternosTab").then((module) => ({ default: module.ManuaisInternosTab })),
);
const NoticeFeed = lazy(() => import("../NoticeFeed").then((module) => ({ default: module.NoticeFeed })));
const FuelingsTab = lazy(() => import("../FuelingsTab").then((module) => ({ default: module.FuelingsTab })));
const ContractsUserTab = lazy(() => import("../ContractsUserTab").then((module) => ({ default: module.ContractsUserTab })));
const ReferAndEarnTab = lazy(() => import("../ReferAndEarnTab").then((module) => ({ default: module.ReferAndEarnTab })));

type InstructorSection =
  | "home"
  | "journey"
  | "flights"
  | "fuelings"
  | "notices"
  | "manuals"
  | "manuais-internos"
  | "maneuvers"
  | "students"
  | "profile"
  | "help"
  | "manual-instrutor"
  | "dre"
  | "schedule"
  | "contratos"
  | "indique-ganhe"
  | "reports";

type NavItem = {
  id: InstructorSection;
  label: string;
  sublabel: string;
  icon: ReactNode;
};

const SELECTED_NAV_CLASS = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";

const NAV_ITEMS: NavItem[] = [
  {
    id: "home",
    label: "Home",
    sublabel: "Avisos e próximos voos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.69-8.69a2.25 2.25 0 00-3.18 0l-8.69 8.69a.75.75 0 001.06 1.06l8.69-8.69z" />
        <path d="M12 5.432l8.159 8.159c.03.03.061.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625A1.875 1.875 0 013.75 19.875v-6.198c.03-.028.061-.056.091-.086L12 5.432z" />
      </svg>
    ),
  },
  {
    id: "journey",
    label: "Jornada",
    sublabel: "Evolução, recordes e badges",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M5.166 2.621A.75.75 0 015.75 2.25h12.5a.75.75 0 01.584.371l1.25 2.083a3.75 3.75 0 01-2.396 5.577 6.773 6.773 0 01-4.938 4.102v2.117h2.5a.75.75 0 01.75.75v2h2.25a.75.75 0 010 1.5H5.75a.75.75 0 010-1.5H8v-2a.75.75 0 01.75-.75h2.5v-2.117a6.773 6.773 0 01-4.938-4.102 3.75 3.75 0 01-2.396-5.577l1.25-2.083zM6 4.5l-.798 1.33A2.25 2.25 0 006 9.198V4.5zm12 4.698a2.25 2.25 0 00.798-3.368L18 4.5v4.698z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "flights",
    label: "Meus voos",
    sublabel: "Futuros, antigos e fichas",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
      </svg>
    ),
  },
  {
    id: "notices",
    label: "Avisos",
    sublabel: "Feed de comunicados",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M1.5 8.67c0-1.213.84-2.266 2.024-2.49l13.5-2.56a2.25 2.25 0 012.669 2.21v12.34a2.25 2.25 0 01-2.67 2.21l-13.5-2.56A2.532 2.532 0 011.5 15.33V8.67z" />
        <path d="M20.25 8.99a.75.75 0 011.5 0v5.02a.75.75 0 01-1.5 0V8.99z" />
      </svg>
    ),
  },
  {
    id: "manuals",
    label: "Manuais",
    sublabel: "Materiais e documentos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
      </svg>
    ),
  },
  {
    id: "manuais-internos",
    label: "Manuais internos",
    sublabel: "Documentos de uso interno",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "maneuvers",
    label: "Manobras",
    sublabel: "Material de estudo",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 8.625a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM15.375 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zM7.5 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "students",
    label: "Alunos",
    sublabel: "Observações por aluno",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
      </svg>
    ),
  },
  {
    id: "profile",
    label: "Perfil",
    sublabel: "Dados e disponibilidade",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "fuelings",
    label: "Abastecimentos",
    sublabel: "Lançamentos de combustível",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M6.75 2.25A2.25 2.25 0 004.5 4.5v16.125c0 .621.504 1.125 1.125 1.125h7.5c.621 0 1.125-.504 1.125-1.125V4.5A2.25 2.25 0 0012 2.25H6.75zm.75 3a.75.75 0 01.75-.75h2.25a.75.75 0 01.75.75v4.5a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-4.5z" />
        <path d="M15.75 7.5a.75.75 0 011.28-.53l2.25 2.25a.75.75 0 01.22.53v7.875a1.125 1.125 0 102.25 0V12a2.25 2.25 0 00-.66-1.59l-2.03-2.03a2.25 2.25 0 01-.66-1.59V6a.75.75 0 00-1.5 0v.79c0 1 .397 1.961 1.105 2.669l1.995 1.995v6.171a2.625 2.625 0 11-5.25 0V7.5z" />
      </svg>
    ),
  },
  {
    id: "help",
    label: "Ajuda",
    sublabel: "Central de ajuda",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm9.75-5.25a3.375 3.375 0 00-3.356 3H10.2a1.875 1.875 0 113.675.519c-.261.493-.694.801-1.166 1.104l-.259.166c-.538.348-1.2.777-1.2 1.711v.75h1.5v-.59c.056-.061.22-.174.514-.365l.253-.163c.566-.363 1.266-.812 1.684-1.603A3.375 3.375 0 0012 6.75Zm0 10.5a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "dre",
    label: "Diário de bordo",
    sublabel: "Mesma visão do admin",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12 7.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
        <path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 011.5 14.625v-9.75zM8.25 9.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM18.75 9a.75.75 0 00-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 00.75-.75V9.75a.75.75 0 00-.75-.75h-.008zM4.5 9.75A.75.75 0 015.25 9h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H5.25a.75.75 0 01-.75-.75V9.75z" clipRule="evenodd" />
        <path d="M2.25 18a.75.75 0 000 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 00-.75-.75H2.25z" />
      </svg>
    ),
  },
  {
    id: "schedule",
    label: "Escala",
    sublabel: "Mesma escala do admin",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "contratos",
    label: "Contratos",
    sublabel: "Seus contratos para assinar",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6zM13.5 3A1.5 1.5 0 0012 4.5h4.5A1.5 1.5 0 0015 3h-1.5z" clipRule="evenodd" />
        <path fillRule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V9.375zm4.5 2.625a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75zm-2.25 3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "reports",
    label: "Relatórios",
    sublabel: "Seus voos em relatórios",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M3.75 3A.75.75 0 003 3.75v16.5c0 .414.336.75.75.75h16.5a.75.75 0 000-1.5H4.5V3.75A.75.75 0 003.75 3z" />
        <path d="M8.25 17.25a.75.75 0 01-.75-.75v-4.25a.75.75 0 011.5 0v4.25a.75.75 0 01-.75.75zM12 17.25a.75.75 0 01-.75-.75V8.75a.75.75 0 011.5 0v7.75a.75.75 0 01-.75.75zM15.75 17.25a.75.75 0 01-.75-.75v-6a.75.75 0 011.5 0v6a.75.75 0 01-.75.75zM19.5 17.25a.75.75 0 01-.75-.75V6.75a.75.75 0 011.5 0v9.75a.75.75 0 01-.75.75z" />
      </svg>
    ),
  },
  {
    id: "indique-ganhe",
    label: "Indique e ganhe",
    sublabel: "Indique alunos e acompanhe",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M5.25 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM13.5 3.873a3.375 3.375 0 106.75 0 3.375 3.375 0 00-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63v-.003zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 003.958-1.006 3.375 3.375 0 00-3.725-3.725 10.088 10.088 0 00-1.006 3.958 2.25 2.25 0 01-.96.233h-.144z" />
      </svg>
    ),
  },
];

const INSTRUCTOR_MENU_ORDER: readonly InstructorSection[] = [
  "home",
  "flights",
  "schedule",
  "students",
  "maneuvers",
  "manuals",
  "manuais-internos",
  "reports",
  "notices",
  "contratos",
  "profile",
];

const INSTRUCTOR_MENU_POSITION = new Map(
  INSTRUCTOR_MENU_ORDER.map((id, index) => [id, index]),
);

const SECTION_ROUTES = [
  { id: "home", path: "/instrutor" },
  { id: "journey", path: "/instrutor/jornada" },
  { id: "flights", path: "/instrutor/meus-voos" },
  { id: "fuelings", path: "/instrutor/abastecimentos" },
  { id: "notices", path: "/instrutor/avisos" },
  { id: "manuals", path: "/instrutor/manuais" },
  { id: "manuais-internos", path: "/instrutor/manuais-internos" },
  { id: "maneuvers", path: "/instrutor/manobras" },
  { id: "students", path: "/instrutor/alunos" },
  { id: "profile", path: "/instrutor/perfil" },
  { id: "help", path: "/instrutor/ajuda" },
  { id: "manual-instrutor", path: "/instrutor/manual-instrutor" },
  { id: "dre", path: "/instrutor/edb" },
  { id: "schedule", path: "/instrutor/escala" },
  { id: "contratos", path: "/instrutor/contratos" },
  { id: "reports", path: "/instrutor/relatorios" },
  { id: "indique-ganhe", path: "/instrutor/indique-ganhe" },
] satisfies readonly TabRoute<InstructorSection>[];

function TabLoading() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
      <div className="h-4 w-40 animate-pulse rounded bg-slate-800" />
      <div className="mt-4 h-24 animate-pulse rounded bg-slate-800/70" />
    </div>
  );
}

function LazyTab({ children }: { children: ReactNode }) {
  return <Suspense fallback={<TabLoading />}>{children}</Suspense>;
}

export function InstructorLayout() {
  const { user, signOut } = useAuth();
  const { canTab } = usePermissions();
  const [section, setSection] = useRoutedTab(SECTION_ROUTES, "home");
  const openedSections = useOpenedTabs(section);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [referProgramActive, setReferProgramActive] = useState(false);
  const [onboardingInMenu, setOnboardingInMenu] = useState(false);
  const activeNav = NAV_ITEMS.find((item) => item.id === section) ?? {
    id: section,
    label: section === "manual-instrutor" ? "Manual do instrutor" : section,
    sublabel: "",
    icon: null,
  };

  useEffect(() => {
    let cancelled = false;
    void getReferAndEarnPublic()
      .then(({ referAndEarn }) => {
        if (cancelled) return;
        setReferProgramActive(programConfigForRole(referAndEarn, "instrutor").active);
      })
      .catch(() => {
        if (cancelled) return;
        setReferProgramActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getOnboardingPublic()
      .then(({ onboarding }) => {
        if (cancelled) return;
        setOnboardingInMenu(Boolean(onboarding.showInStudentMenu));
      })
      .catch(() => {
        if (cancelled) return;
        setOnboardingInMenu(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleScheduleTabs = useMemo<ScheduleSubTab[]>(() => {
    const out: ScheduleSubTab[] = [];
    if (canTab("schedule.voos")) out.push("flights");
    if (canTab("schedule.disponibilidades")) out.push("weekly");
    if (canTab("schedule.gerador")) out.push("generator");
    return out;
  }, [canTab]);

  const visibleNavItems = useMemo(
    () =>
      NAV_ITEMS
        .filter((item) => {
          if (!INSTRUCTOR_MENU_POSITION.has(item.id)) return false;
          if (!canTab(item.id as InstructorTabKey)) return false;
          if (item.id === "indique-ganhe") return referProgramActive;
          if (item.id === "schedule") return visibleScheduleTabs.length > 0;
          return true;
        })
        .sort((a, b) => INSTRUCTOR_MENU_POSITION.get(a.id)! - INSTRUCTOR_MENU_POSITION.get(b.id)!),
    [canTab, referProgramActive, visibleScheduleTabs],
  );
  const helpNavItem = visibleNavItems.find((item) => item.id === "help") ?? null;
  const manualInstrutorEnabled = canTab("manual-instrutor");
  const mainNavItems = visibleNavItems.filter((item) => item.id !== "help" && item.id !== "manual-instrutor");

  return (
    <div className="flex min-h-screen bg-slate-950">
      <aside className={`sticky top-0 hidden h-screen flex-col border-r border-slate-800 bg-slate-950/80 transition-[width] duration-200 lg:flex ${sidebarCollapsed ? "w-20" : "w-64"}`}>
        <div className={`border-b border-slate-800 py-5 ${sidebarCollapsed ? "px-3" : "px-5"}`}>
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between gap-3"}`}>
          <span className={`${sidebarCollapsed ? "hidden" : ""} rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sky-400`}>
            Instrutor
          </span>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              title={sidebarCollapsed ? "Expandir menu" : "Ocultar menu"}
              aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Ocultar menu lateral"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                {sidebarCollapsed ? (
                  <path fillRule="evenodd" d="M7.22 4.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.94 10 7.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M12.78 4.22a.75.75 0 010 1.06L8.06 10l4.72 4.72a.75.75 0 11-1.06 1.06l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" clipRule="evenodd" />
                )}
              </svg>
            </button>
          </div>
          <p className={`${sidebarCollapsed ? "hidden" : ""} mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500`}>Operação de voo</p>
          <p className={`${sidebarCollapsed ? "hidden" : ""} text-sm font-semibold text-slate-200`}>Portal do INVA</p>
        </div>

        <nav className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-4 ${sidebarCollapsed ? "px-2" : "px-3"}`}>
          {mainNavItems.map((item) => {
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-label={sidebarCollapsed ? item.label : undefined}
                className={`group flex w-full items-center rounded-lg border py-2.5 transition-all ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3 text-left"} ${
                  isActive
                    ? SELECTED_NAV_CLASS
                    : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <span className={isActive ? "" : "opacity-60 group-hover:opacity-100"}>{item.icon}</span>
                <div className={sidebarCollapsed ? "hidden" : "min-w-0"}>
                  <p className="text-sm font-medium leading-none">{item.label}</p>
                </div>
              </button>
            );
          })}
          {onboardingInMenu ? (
            <a
              href="/apresentacao"
              target="_blank"
              rel="noopener noreferrer"
              title={sidebarCollapsed ? "Manual do Aluno" : undefined}
              aria-label={sidebarCollapsed ? "Manual do Aluno" : undefined}
              className={`group flex w-full items-center rounded-lg border border-transparent py-2.5 text-cyan-400 transition-all hover:border-cyan-700/40 hover:bg-cyan-950/30 hover:text-cyan-300 ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3"}`}
            >
              <span className="opacity-70 group-hover:opacity-100">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M2.25 5.25a3 3 0 013-3h13.5a3 3 0 013 3V15a3 3 0 01-3 3h-3v.257c0 .597.237 1.17.659 1.591l.621.622a.75.75 0 01-.53 1.28h-9a.75.75 0 01-.53-1.28l.621-.622a2.25 2.25 0 00.659-1.59V18h-3a3 3 0 01-3-3V5.25zm1.5 0v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5z" clipRule="evenodd" />
                </svg>
              </span>
              <div className={sidebarCollapsed ? "hidden" : "min-w-0"}>
                <p className="text-sm font-medium leading-none">Manual do Aluno</p>
              </div>
            </a>
          ) : null}
          {manualInstrutorEnabled ? (
            <button
              type="button"
              onClick={() => setSection("manual-instrutor")}
              title={sidebarCollapsed ? "Manual do instrutor" : undefined}
              aria-label={sidebarCollapsed ? "Manual do instrutor" : undefined}
              className={`group flex w-full items-center rounded-lg border py-2.5 transition-all ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3 text-left"} ${
                section === "manual-instrutor"
                  ? "border-cyan-500/40 bg-cyan-950/30 text-cyan-300"
                  : "border-transparent text-cyan-400 hover:border-cyan-700/40 hover:bg-cyan-950/30 hover:text-cyan-300"
              }`}
            >
              <span className={section === "manual-instrutor" ? "" : "opacity-70 group-hover:opacity-100"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M2.25 5.25a3 3 0 013-3h13.5a3 3 0 013 3V15a3 3 0 01-3 3h-3v.257c0 .597.237 1.17.659 1.591l.621.622a.75.75 0 01-.53 1.28h-9a.75.75 0 01-.53-1.28l.621-.622a2.25 2.25 0 00.659-1.59V18h-3a3 3 0 01-3-3V5.25zm1.5 0v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5z" clipRule="evenodd" />
                </svg>
              </span>
              <div className={sidebarCollapsed ? "hidden" : "min-w-0"}>
                <p className="text-sm font-medium leading-none">Manual do instrutor</p>
              </div>
            </button>
          ) : null}
        </nav>

        {helpNavItem ? (
          <div className={`${sidebarCollapsed ? "px-2 pb-1" : "px-3 pb-1"}`}>
            <button
              type="button"
              onClick={() => setSection(helpNavItem.id)}
              title={sidebarCollapsed ? helpNavItem.label : undefined}
              aria-label={sidebarCollapsed ? helpNavItem.label : undefined}
              className={`group flex w-full items-center rounded-lg border py-2.5 transition-all ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3 text-left"} ${
                section === helpNavItem.id
                  ? SELECTED_NAV_CLASS
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <span className={section === helpNavItem.id ? "" : "opacity-60 group-hover:opacity-100"}>{helpNavItem.icon}</span>
              <div className={sidebarCollapsed ? "hidden" : "min-w-0"}>
                <p className="text-sm font-medium leading-none">{helpNavItem.label}</p>
              </div>
            </button>
          </div>
        ) : null}
        <div className={`border-t border-slate-800 py-4 ${sidebarCollapsed ? "px-2" : "px-4"}`}>
          <UserEmailWithRoleSwitcher email={user?.email} sidebarCollapsed={sidebarCollapsed} />
          <button
            type="button"
            onClick={() => void signOut()}
            title={sidebarCollapsed ? "Sair" : undefined}
            aria-label={sidebarCollapsed ? "Sair" : undefined}
            className={`w-full rounded-lg border border-slate-700 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 ${sidebarCollapsed ? "flex h-9 items-center justify-center px-2" : "mt-2 px-3 py-1.5"}`}
          >
            {sidebarCollapsed ? (
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h4.5A2.25 2.25 0 0112 4.25v1a.75.75 0 01-1.5 0v-1a.75.75 0 00-.75-.75h-4.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75v-1a.75.75 0 011.5 0v1A2.25 2.25 0 019.75 18h-4.5A2.25 2.25 0 013 15.75V4.25zm10.22 3.22a.75.75 0 011.06 0l2 2a.75.75 0 010 1.06l-2 2a.75.75 0 11-1.06-1.06l.72-.72H8.75a.75.75 0 010-1.5h5.19l-.72-.72a.75.75 0 010-1.06z" clipRule="evenodd" />
              </svg>
            ) : "Sair"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
            <PortalShellHeader
              roleLabel="Instrutor"
              roleBadgeClassName="bg-sky-500/20 text-sky-400"
              title={activeNav.label}
            />
            <div className="flex items-center gap-3">
              <div className="lg:hidden">
                <UserEmailWithRoleSwitcher email={user?.email} header />
              </div>
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
              <LazyTab>
                <InstructorHome onOpenFlights={() => setSection("flights")} />
              </LazyTab>
            </div>
          )}
          {openedSections.has("journey") && (
            <div hidden={section !== "journey"}>
              <LazyTab>
                <JornadaTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("flights") && (
            <div hidden={section !== "flights"}>
              <LazyTab>
                <InstructorFlightsTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("fuelings") && (
            <div hidden={section !== "fuelings"}>
              <LazyTab>
                <FuelingsTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("notices") && (
            <div hidden={section !== "notices"}>
              <LazyTab>
                <NoticeFeed className="w-full max-w-4xl" showHeader={false} />
              </LazyTab>
            </div>
          )}
          {openedSections.has("manuals") && (
            <div hidden={section !== "manuals"}>
              <LazyTab>
                <ManuaisTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("manuais-internos") && (
            <div hidden={section !== "manuais-internos"}>
              <LazyTab>
                <ManuaisInternosTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("maneuvers") && (
            <div hidden={section !== "maneuvers"}>
              <LazyTab>
                <ManobrasTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("students") && (
            <div hidden={section !== "students"} className="flex min-h-[calc(100vh-12rem)] flex-col">
              <LazyTab>
                <InstructorStudentsTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("profile") && (
            <div hidden={section !== "profile"}>
              <LazyTab>
                <InstructorProfileTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("help") && (
            <div hidden={section !== "help"}>
              <LazyTab>
                <HelpCenterTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("manual-instrutor") && (
            <div hidden={section !== "manual-instrutor"}>
              <LazyTab>
                <HelpCenterTab audience="instructor" />
              </LazyTab>
            </div>
          )}
          {openedSections.has("dre") && (
            <div hidden={section !== "dre"}>
              <LazyTab>
                <DiarioDeBordoTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("schedule") && (
            <div hidden={section !== "schedule"}>
              <LazyTab>
                <ScheduleAdminTab visibleSubTabsOverride={visibleScheduleTabs} />
              </LazyTab>
            </div>
          )}
          {openedSections.has("contratos") && (
            <div hidden={section !== "contratos"}>
              <LazyTab>
                <ContractsUserTab
                  userId={user?.id ?? ""}
                  schoolId={user?.schoolId ?? ""}
                  userRole="instrutor"
                />
              </LazyTab>
            </div>
          )}
          {openedSections.has("reports") && (
            <div hidden={section !== "reports"}>
              <LazyTab>
                <FlightReportsTab lockedInstructorUserId={user?.id ?? ""} hideInstructorFilter />
              </LazyTab>
            </div>
          )}
          {openedSections.has("indique-ganhe") && (
            <div hidden={section !== "indique-ganhe"}>
              <LazyTab>
                <ReferAndEarnTab portalRole="instrutor" />
              </LazyTab>
            </div>
          )}
        </main>

        <nav className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="flex overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/95 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
            {onboardingInMenu ? (
              <a
                href="/apresentacao"
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-[4.75rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium text-cyan-400 transition hover:text-cyan-300"
              >
                <span className="h-4 w-4">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M2.25 5.25a3 3 0 013-3h13.5a3 3 0 013 3V15a3 3 0 01-3 3h-3v.257c0 .597.237 1.17.659 1.591l.621.622a.75.75 0 01-.53 1.28h-9a.75.75 0 01-.53-1.28l.621-.622a2.25 2.25 0 00.659-1.59V18h-3a3 3 0 01-3-3V5.25zm1.5 0v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5z" clipRule="evenodd" />
                  </svg>
                </span>
                <span className="max-w-full truncate">Manual Aluno</span>
              </a>
            ) : null}
            {manualInstrutorEnabled ? (
              <button
                type="button"
                onClick={() => setSection("manual-instrutor")}
                className={`flex min-w-[4.75rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition ${
                  section === "manual-instrutor" ? "bg-cyan-500/10 text-cyan-300" : "text-cyan-400 hover:text-cyan-300"
                }`}
              >
                <span className="h-4 w-4">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M2.25 5.25a3 3 0 013-3h13.5a3 3 0 013 3V15a3 3 0 01-3 3h-3v.257c0 .597.237 1.17.659 1.591l.621.622a.75.75 0 01-.53 1.28h-9a.75.75 0 01-.53-1.28l.621-.622a2.25 2.25 0 00.659-1.59V18h-3a3 3 0 01-3-3V5.25zm1.5 0v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5z" clipRule="evenodd" />
                  </svg>
                </span>
                <span className="max-w-full truncate">Manual INVA</span>
              </button>
            ) : null}
            {visibleNavItems.map((item) => {
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex min-w-[4.75rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition ${
                    isActive ? "bg-emerald-500/10 text-emerald-400" : "text-slate-500 hover:text-slate-300"
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
