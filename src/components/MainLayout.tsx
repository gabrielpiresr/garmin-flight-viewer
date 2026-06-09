import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { FlightReviewClubProvider } from "../contexts/FlightReviewClubContext";
import { useOpenedTabs, useRoutedTab, type TabRoute } from "../lib/routedTabs";
import { applySchoolTheme, getSchoolRules } from "../lib/schoolRulesDb";
import { getReferAndEarnPublic, programConfigForRole } from "../lib/referAndEarnDb";
import { getOnboardingPublic } from "../lib/onboardingDb";
import { listStudentTrainingTracks } from "../lib/trainingTracksDb";
import { DEFAULT_SCHOOL_RULES, type SchoolRules } from "../types/schoolRules";
import { PortalShellHeader } from "./PortalShellHeader";
import { PushNotificationsToggle } from "./PushNotificationsToggle";
import { InstallPwaButton } from "./InstallPwaButton";
import type { StudentTabKey } from "../types/rolePermissions";

const AgendamentoTab = lazy(() => import("./AgendamentoTab").then((module) => ({ default: module.AgendamentoTab })));
const AlunoProfileDashboard = lazy(() =>
  import("./AlunoProfileDashboard").then((module) => ({ default: module.AlunoProfileDashboard })),
);
const CreditosTab = lazy(() => import("./CreditosTab").then((module) => ({ default: module.CreditosTab })));
const FuelingsTab = lazy(() => import("./FuelingsTab").then((module) => ({ default: module.FuelingsTab })));
const HelpCenterTab = lazy(() => import("./HelpCenterTab").then((module) => ({ default: module.HelpCenterTab })));
const JornadaTab = lazy(() => import("./JornadaTab").then((module) => ({ default: module.JornadaTab })));
const ManobrasTab = lazy(() => import("./ManobrasTab").then((module) => ({ default: module.ManobrasTab })));
const ManuaisTab = lazy(() => import("./ManuaisTab").then((module) => ({ default: module.ManuaisTab })));
const MeusVoosTab = lazy(() => import("./MeusVoosTab").then((module) => ({ default: module.MeusVoosTab })));
const NoticeFeed = lazy(() => import("./NoticeFeed").then((module) => ({ default: module.NoticeFeed })));
const StudentDreTab = lazy(() => import("./StudentDreTab").then((module) => ({ default: module.StudentDreTab })));
const StudentHome = lazy(() => import("./StudentHome").then((module) => ({ default: module.StudentHome })));
const StudentScheduleTab = lazy(() => import("./StudentScheduleTab").then((module) => ({ default: module.StudentScheduleTab })));
const ContractsUserTab = lazy(() => import("./ContractsUserTab").then((module) => ({ default: module.ContractsUserTab })));
const ReferAndEarnTab = lazy(() => import("./ReferAndEarnTab").then((module) => ({ default: module.ReferAndEarnTab })));

type Section = StudentTabKey;

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
    id: "schedule",
    label: "Escala",
    sublabel: "Calendário e agendamento",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm-1.5 7.5v9h13.5v-9H5.25z" clipRule="evenodd" />
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
  {
    id: "ajuda",
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
    label: "EDB",
    sublabel: "Extrato financeiro",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12 7.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
        <path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 011.5 14.625v-9.75zM8.25 9.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM18.75 9a.75.75 0 00-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 00.75-.75V9.75a.75.75 0 00-.75-.75h-.008zM4.5 9.75A.75.75 0 015.25 9h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H5.25a.75.75 0 01-.75-.75V9.75z" clipRule="evenodd" />
        <path d="M2.25 18a.75.75 0 000 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 00-.75-.75H2.25z" />
      </svg>
    ),
  },
  {
    id: "fuelings",
    label: "Abastecimentos",
    sublabel: "Registros de combustível",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M6.75 2.25A2.25 2.25 0 004.5 4.5v16.125c0 .621.504 1.125 1.125 1.125h7.5c.621 0 1.125-.504 1.125-1.125V4.5A2.25 2.25 0 0012 2.25H6.75zm.75 3a.75.75 0 01.75-.75h2.25a.75.75 0 01.75.75v4.5a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-4.5z" />
        <path d="M15.75 7.5a.75.75 0 011.28-.53l2.25 2.25a.75.75 0 01.22.53v7.875a1.125 1.125 0 102.25 0V12a2.25 2.25 0 00-.66-1.59l-2.03-2.03a2.25 2.25 0 01-.66-1.59V6a.75.75 0 00-1.5 0v.79c0 1 .397 1.961 1.105 2.669l1.995 1.995v6.171a2.625 2.625 0 11-5.25 0V7.5z" />
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
    id: "indique-ganhe",
    label: "Indique e ganhe",
    sublabel: "Indique amigos e acompanhe",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M5.25 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM13.5 3.873a3.375 3.375 0 106.75 0 3.375 3.375 0 00-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63v-.003zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 003.958-1.006 3.375 3.375 0 00-3.725-3.725 10.088 10.088 0 00-1.006 3.958 2.25 2.25 0 01-.96.233h-.144zM21.884 19.128a.75.75 0 00-.233-.96 4.5 4.5 0 00-1.424-1.424.75.75 0 00-.96-.233h-.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 003.958 1.006 3.375 3.375 0 003.725-3.725 10.088 10.088 0 00-1.006-3.958 2.25 2.25 0 01-.96-.233h.144a.75.75 0 00.96.233 4.5 4.5 0 001.424 1.424.75.75 0 00.233.96z" />
      </svg>
    ),
  },
];

const SECTION_ROUTES = [
  { id: "home", path: "/aluno", aliases: ["/"] },
  { id: "jornada", path: "/aluno/jornada" },
  { id: "meus-voos", path: "/aluno/meus-voos" },
  { id: "agendamento", path: "/aluno/agendamento" },
  { id: "schedule", path: "/aluno/escala" },
  { id: "creditos", path: "/aluno/creditos" },
  { id: "avisos", path: "/aluno/avisos" },
  { id: "manuais", path: "/aluno/manuais" },
  { id: "manobras", path: "/aluno/manobras" },
  { id: "perfil", path: "/aluno/perfil" },
  { id: "ajuda", path: "/aluno/ajuda" },
  { id: "dre", path: "/aluno/edb" },
  { id: "fuelings", path: "/aluno/abastecimentos" },
  { id: "contratos", path: "/aluno/contratos" },
  { id: "indique-ganhe", path: "/aluno/indique-ganhe" },
] satisfies readonly TabRoute<Section>[];

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

export function MainLayout() {
  const { user, signOut } = useAuth();
  const { canTab } = usePermissions();
  const [section, setSection] = useRoutedTab(SECTION_ROUTES, "home");
  const openedSections = useOpenedTabs(section);
  const [rules, setRules] = useState<SchoolRules>(DEFAULT_SCHOOL_RULES);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isClubMember, setIsClubMember] = useState(false);
  const [referProgramActive, setReferProgramActive] = useState(false);
  const [onboardingInMenu, setOnboardingInMenu] = useState(false);

  const visibleNavItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (!canTab(item.id as StudentTabKey)) return false;
        if (item.id === "indique-ganhe") return referProgramActive;
        return true;
      }),
    [canTab, referProgramActive],
  );
  const availableNavItems = visibleNavItems.length > 0 ? visibleNavItems : [NAV_ITEMS[0]!];
  const activeNav = availableNavItems.find((item) => item.id === section) ?? availableNavItems[0]!;
  const ajudaNavItem = availableNavItems.find((item) => item.id === "ajuda") ?? null;
  const mainNavItems = availableNavItems.filter((item) => item.id !== "ajuda");

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
    let cancelled = false;
    void getReferAndEarnPublic()
      .then(({ referAndEarn }) => {
        if (cancelled) return;
        setReferProgramActive(programConfigForRole(referAndEarn, "aluno").active);
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
    if (!user?.id) return;
    let cancelled = false;
    void listStudentTrainingTracks(user.id).then((result) => {
      if (cancelled) return;
      const primary = result.data?.find((t) => t.isPrimary) ?? result.data?.[0] ?? null;
      setIsClubMember(primary?.isFlightReviewClubMember ?? false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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

  useEffect(() => {
    if (!availableNavItems.some((item) => item.id === section)) {
      setSection(availableNavItems[0]!.id, { replace: true });
    }
  }, [availableNavItems, section]);

  const clubLpUrl = rules.flightReviewClub.landingPageType === "external_url"
    ? rules.flightReviewClub.externalUrl
    : `${window.location.origin}/flight-review-club`;

  const clubContextValue = {
    enabled: rules.flightReviewClub.enabled,
    isClubMember,
    lpUrl: clubLpUrl,
    trialFlightCount: rules.flightReviewClub.trialFlightCount,
    benefits: rules.flightReviewClub.benefits,
  };

  return (
    <FlightReviewClubProvider value={clubContextValue}>
    <div className="school-themed-shell flex min-h-screen">
      <aside className={`school-themed-surface sticky top-0 hidden h-screen flex-col border-r border-slate-800 transition-[width] duration-200 lg:flex ${sidebarCollapsed ? "w-20" : "w-64"}`}>
        <div className={`border-b border-slate-800 py-5 ${sidebarCollapsed ? "px-3" : "px-5"}`}>
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between gap-3"}`}>
          <span className={`${sidebarCollapsed ? "hidden" : ""} rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sky-400`}>
            Aluno
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
          <p className={`${sidebarCollapsed ? "hidden" : ""} mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500`}>Portal do aluno</p>
          <p className={`${sidebarCollapsed ? "hidden" : ""} text-sm font-semibold text-slate-200`}>Operação de voo</p>
        </div>

        <nav className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-4 ${sidebarCollapsed ? "px-2" : "px-3"}`}>
          {mainNavItems.map((item) => {
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openSection(item.id)}
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
          {rules.flightReviewClub.enabled && rules.flightReviewClub.showInStudentMenu ? (
            <a
              href={clubLpUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={sidebarCollapsed ? "Flight Review Club" : undefined}
              aria-label={sidebarCollapsed ? "Flight Review Club" : undefined}
              className={`group flex w-full items-center rounded-lg border border-transparent py-2.5 text-amber-400 transition-all hover:border-amber-700/40 hover:bg-amber-950/30 hover:text-amber-300 ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3"}`}
            >
              <span className="opacity-70 group-hover:opacity-100">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                </svg>
              </span>
              <div className={sidebarCollapsed ? "hidden" : "min-w-0"}>
                <p className="text-sm font-medium leading-none">Flight Review Club</p>
              </div>
            </a>
          ) : null}
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
        </nav>

        {ajudaNavItem ? (
          <div className={`${sidebarCollapsed ? "px-2 pb-1" : "px-3 pb-1"}`}>
            <button
              type="button"
              onClick={() => openSection(ajudaNavItem.id)}
              title={sidebarCollapsed ? ajudaNavItem.label : undefined}
              aria-label={sidebarCollapsed ? ajudaNavItem.label : undefined}
              className={`group flex w-full items-center rounded-lg border py-2.5 transition-all ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3 text-left"} ${
                section === ajudaNavItem.id
                  ? SELECTED_NAV_CLASS
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <span className={section === ajudaNavItem.id ? "" : "opacity-60 group-hover:opacity-100"}>{ajudaNavItem.icon}</span>
              <div className={sidebarCollapsed ? "hidden" : "min-w-0"}>
                <p className="text-sm font-medium leading-none">{ajudaNavItem.label}</p>
              </div>
            </button>
          </div>
        ) : null}
        <div className={`border-t border-slate-800 py-4 ${sidebarCollapsed ? "px-2" : "px-4"}`}>
          {!sidebarCollapsed ? <p className="truncate text-xs text-slate-500">{user?.email}</p> : null}
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
          <div className="school-themed-surface flex items-center justify-between gap-4 px-4 py-3 md:px-6">
            <PortalShellHeader
              roleLabel="Aluno"
              roleBadgeClassName="bg-sky-500/20 text-sky-400"
              title={activeNav.label}
            />
            <div className="flex items-center gap-3">
              <InstallPwaButton className="hidden sm:block" />
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
              <LazyTab>
                <StudentHome
                  onOpenFlights={() => openSection("meus-voos")}
                  onOpenNotices={() => openSection("avisos")}
                />
              </LazyTab>
            </div>
          )}
          {openedSections.has("jornada") && (
            <div hidden={section !== "jornada"}>
              <LazyTab>
                <JornadaTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("meus-voos") && (
            <div hidden={section !== "meus-voos"}>
              <LazyTab>
                <MeusVoosTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("agendamento") && (
            <div hidden={section !== "agendamento"}>
              <LazyTab>
                <AgendamentoTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("schedule") && (
            <div hidden={section !== "schedule"}>
              <LazyTab>
                <StudentScheduleTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("creditos") && (
            <div hidden={section !== "creditos"}>
              <LazyTab>
                <CreditosTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("avisos") && (
            <div hidden={section !== "avisos"}>
              <LazyTab>
                <NoticeFeed className="w-full max-w-4xl" showHeader={false} />
              </LazyTab>
            </div>
          )}
          {openedSections.has("manuais") && (
            <div hidden={section !== "manuais"}>
              <LazyTab>
                <ManuaisTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("manobras") && (
            <div hidden={section !== "manobras"}>
              <LazyTab>
                <ManobrasTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("perfil") && (
            <div hidden={section !== "perfil"}>
              <LazyTab>
                <AlunoProfileDashboard />
              </LazyTab>
            </div>
          )}
          {openedSections.has("ajuda") && (
            <div hidden={section !== "ajuda"}>
              <LazyTab>
                <HelpCenterTab />
              </LazyTab>
            </div>
          )}
          {openedSections.has("dre") && (
            <div hidden={section !== "dre"}>
              <LazyTab>
                <StudentDreTab />
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
          {openedSections.has("contratos") && (
            <div hidden={section !== "contratos"}>
              <LazyTab>
                <ContractsUserTab
                  userId={user?.id ?? ""}
                  schoolId={user?.schoolId ?? ""}
                  userRole="aluno"
                />
              </LazyTab>
            </div>
          )}
          {openedSections.has("indique-ganhe") && (
            <div hidden={section !== "indique-ganhe"}>
              <LazyTab>
                <ReferAndEarnTab portalRole="aluno" />
              </LazyTab>
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
    </FlightReviewClubProvider>
  );
}
