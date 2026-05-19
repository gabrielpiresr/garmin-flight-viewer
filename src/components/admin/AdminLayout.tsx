import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  pathForRoute,
  resolveRouteId,
  routeMatches,
  useOpenedTabs,
  useRoutedTab,
  type TabRoute,
} from "../../lib/routedTabs";
import { PushNotificationsToggle } from "../PushNotificationsToggle";
import { Tabs } from "../ui/Tabs";
import { ModelsTab } from "./ModelsTab";
import { FleetTab } from "./FleetTab";
import { MaintenanceTab } from "./MaintenanceTab";
import { TelemetryAlertsTab } from "./TelemetryAlertsTab";
import { ManobrasTab } from "./ManobrasTab";
import { PlatformSettingsTab, type SettingsSubTab } from "./PlatformSettingsTab";
import { ScheduleAdminTab, type ScheduleSubTab } from "./ScheduleAdminTab";
import { AdminStudentsTab } from "./AdminStudentsTab";
import { AdminUsersTab } from "./AdminUsersTab";
import { FlightReportsTab } from "./FlightReportsTab";
import { NoTelemetryTab } from "./NoTelemetryTab";
import { AdminHome } from "./AdminHome";
import { ManuaisAdminTab } from "./ManuaisAdminTab";

type AdminSection =
  | "home"
  | "fleet"
  | "telemetry-alerts"
  | "no-telemetry"
  | "schedule"
  | "maneuvers"
  | "manuals"
  | "reports"
  | "students"
  | "users"
  | "settings";

type FleetSubTab = "aircraft" | "models" | "maintenance";

type NavItem = {
  id: AdminSection;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
};

const SELECTED_NAV_CLASS = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";

const NAV_ITEMS: NavItem[] = [
  {
    id: "home",
    label: "Home",
    sublabel: "Dashboard operacional",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.47 3.841a.75.75 0 011.06 0l8.69 8.69a.75.75 0 11-1.06 1.06l-.91-.91V19.5A1.5 1.5 0 0117.75 21h-3a.75.75 0 01-.75-.75V16.5a1.5 1.5 0 00-3 0v3.75a.75.75 0 01-.75.75h-3a1.5 1.5 0 01-1.5-1.5v-6.819l-.91.91a.75.75 0 11-1.06-1.06l8.69-8.69z" />
      </svg>
    ),
  },
  {
    id: "schedule",
    label: "Escala",
    sublabel: "Voos, disponibilidades e gerador",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v.75h9V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v10.5a3 3 0 01-3 3H5.25a3 3 0 01-3-3V6.75a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm-3 5.25a1.5 1.5 0 011.5-1.5h13.5a1.5 1.5 0 011.5 1.5v.75H3.75V7.5zm4.5 4.5a.75.75 0 000 1.5h2.25V15a.75.75 0 001.5 0v-1.5h2.25a.75.75 0 000-1.5H12V10.5a.75.75 0 00-1.5 0V12H8.25z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "students",
    label: "Alunos",
    sublabel: "Evolução e ritmo de voo",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.7 2.805a.75.75 0 01.6 0l9 3.857a.75.75 0 010 1.378l-9 3.857a.75.75 0 01-.6 0l-9-3.857a.75.75 0 010-1.378l9-3.857z" />
        <path d="M3.75 10.5a.75.75 0 01.75.75v3.75c0 .557.31 1.07.804 1.33l5.25 2.763a3 3 0 002.892 0l5.25-2.763a1.5 1.5 0 00.804-1.33v-3.75a.75.75 0 011.5 0v3.75a3 3 0 01-1.607 2.66l-5.25 2.763a4.5 4.5 0 01-4.286 0l-5.25-2.763A3 3 0 013 15v-3.75a.75.75 0 01.75-.75z" />
        <path d="M7.5 12.75a.75.75 0 011.5 0v2.25a.75.75 0 01-1.5 0v-2.25z" />
      </svg>
    ),
  },
  {
    id: "telemetry-alerts",
    label: "Alertas",
    sublabel: "Telemetria por modelo",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.198 0l7.355 12.74c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.753-2.5-2.599-4.5l7.355-12.74zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "no-telemetry",
    label: "Sem telemetria",
    sublabel: "Importar logs Garmin",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12 2.25a.75.75 0 01.75.75v2.25a7.5 7.5 0 017.5 7.5H21a.75.75 0 010 1.5h-.75a7.5 7.5 0 01-7.5 7.5v2.25a.75.75 0 01-1.5 0v-2.25a7.5 7.5 0 01-7.5-7.5H3a.75.75 0 010-1.5h.75a7.5 7.5 0 017.5-7.5V3a.75.75 0 01.75-.75z" />
      </svg>
    ),
  },
  {
    id: "reports",
    label: "Relatórios",
    sublabel: "Voos, filtros e exportações",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M3.75 3A.75.75 0 003 3.75v16.5c0 .414.336.75.75.75h16.5a.75.75 0 000-1.5H4.5V3.75A.75.75 0 003.75 3z" />
        <path d="M8.25 17.25a.75.75 0 01-.75-.75v-4.25a.75.75 0 011.5 0v4.25a.75.75 0 01-.75.75zM12 17.25a.75.75 0 01-.75-.75V8.75a.75.75 0 011.5 0v7.75a.75.75 0 01-.75.75zM15.75 17.25a.75.75 0 01-.75-.75v-6a.75.75 0 011.5 0v6a.75.75 0 01-.75.75zM19.5 17.25a.75.75 0 01-.75-.75V6.75a.75.75 0 011.5 0v9.75a.75.75 0 01-.75.75z" />
      </svg>
    ),
  },
  {
    id: "fleet",
    label: "Frota",
    sublabel: "Aviões, modelos e manutenções",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
      </svg>
    ),
  },
  {
    id: "maneuvers",
    label: "Manobras",
    sublabel: "Curso, artigos e materiais",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 8.625a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM15.375 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zM7.5 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "manuals",
    label: "Manuais",
    sublabel: "Arquivos e categorias",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
      </svg>
    ),
  },
  {
    id: "users",
    label: "Usuários",
    sublabel: "Perfis, permissões e voos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-1.083 1.881 10.088 10.088 0 004.884-1.233.75.75 0 00.367-.614 5.625 5.625 0 00-6.39-5.57 8.956 8.956 0 012.223 5.392z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Configurações",
    sublabel: "Email, regras, exercícios e avisos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567l-.108.648a7.52 7.52 0 00-1.705.707l-.535-.38a1.875 1.875 0 00-2.413.205l-.47.47a1.875 1.875 0 00-.205 2.413l.38.535a7.52 7.52 0 00-.707 1.705l-.648.108A1.875 1.875 0 001.25 12.078v.844c0 .917.663 1.699 1.567 1.85l.648.108c.173.603.412 1.174.707 1.705l-.38.535a1.875 1.875 0 00.205 2.413l.47.47c.648.648 1.67.735 2.413.205l.535-.38a7.52 7.52 0 001.705.707l.108.648a1.875 1.875 0 001.85 1.567h.844c.917 0 1.699-.663 1.85-1.567l.108-.648a7.52 7.52 0 001.705-.707l.535.38a1.875 1.875 0 002.413-.205l.47-.47c.648-.648.735-1.67.205-2.413l-.38-.535a7.52 7.52 0 00.707-1.705l.648-.108a1.875 1.875 0 001.567-1.85v-.844c0-.917-.663-1.699-1.567-1.85l-.648-.108a7.52 7.52 0 00-.707-1.705l.38-.535a1.875 1.875 0 00-.205-2.413l-.47-.47a1.875 1.875 0 00-2.413-.205l-.535.38a7.52 7.52 0 00-1.705-.707l-.108-.648a1.875 1.875 0 00-1.85-1.567h-.844zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
      </svg>
    ),
  },
];

const FLEET_TABS = [
  {
    id: "aircraft",
    label: "Aviões",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
      </svg>
    ),
  },
  {
    id: "models",
    label: "Modelos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M11.644 1.59a.75.75 0 01.712 0l9.75 5.25a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l9.75-5.25z" />
        <path d="M3.265 10.602l7.668 4.129a2.25 2.25 0 002.134 0l7.668-4.13 1.37.739a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.71 0l-9.75-5.25a.75.75 0 010-1.32l1.37-.738z" />
        <path d="M10.933 19.231l-7.668-4.13-1.37.739a.75.75 0 000 1.32l9.75 5.25c.221.12.489.12.71 0l9.75-5.25a.75.75 0 000-1.32l-1.37-.738-7.668 4.13a2.25 2.25 0 01-2.134-.001z" />
      </svg>
    ),
  },
  {
    id: "maintenance",
    label: "Manutenções",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M12 6.75a5.25 5.25 0 016.775-5.025.75.75 0 01.313 1.248l-3.32 3.319c.063.475.276.934.641 1.299.365.365.824.578 1.3.641l3.318-3.319a.75.75 0 011.248.313 5.25 5.25 0 01-5.472 6.756c-1.018-.086-1.87.1-2.309.634L7.344 21.3A3.298 3.298 0 112.7 16.657l8.684-7.151c.533-.44.72-1.291.634-2.308A5.28 5.28 0 0112 6.75zM4.117 19.125a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008z" clipRule="evenodd" />
      </svg>
    ),
  },
] satisfies Array<{ id: FleetSubTab; label: string; icon: React.ReactNode }>;

const FLEET_ROUTES = [
  { id: "aircraft", path: "/admin/frota/avioes", aliases: ["/admin/frota", "/admin/fleet"] },
  { id: "models", path: "/admin/frota/modelos" },
  { id: "maintenance", path: "/admin/frota/manutencoes" },
] satisfies readonly TabRoute<FleetSubTab>[];

const SCHEDULE_ROUTES = [
  { id: "flights", path: "/admin/escala/voos", aliases: ["/admin/escala", "/admin/schedule"] },
  { id: "weekly", path: "/admin/escala/disponibilidades" },
  { id: "generator", path: "/admin/escala/gerador" },
] satisfies readonly TabRoute<ScheduleSubTab>[];

const SETTINGS_ROUTES = [
  { id: "email", path: "/admin/configuracoes", aliases: ["/admin/configuracoes/email"] },
  { id: "brand", path: "/admin/configuracoes/aparencia" },
  { id: "rules", path: "/admin/configuracoes/regras" },
  { id: "badges", path: "/admin/configuracoes/badges" },
  { id: "tracks", path: "/admin/configuracoes/trilhas" },
  { id: "exercises", path: "/admin/configuracoes/exercicios", aliases: ["/admin/exercicios"] },
  { id: "notices", path: "/admin/configuracoes/avisos", aliases: ["/admin/avisos"] },
  { id: "help", path: "/admin/configuracoes/central-ajuda" },
] satisfies readonly TabRoute<SettingsSubTab>[];

const ADMIN_ROUTES = [
  { id: "home", path: "/admin" },
  { id: "schedule", path: "/admin/escala/voos", aliases: SCHEDULE_ROUTES.flatMap((route) => [route.path, ...(route.aliases ?? [])]) },
  { id: "students", path: "/admin/alunos" },
  { id: "telemetry-alerts", path: "/admin/alertas" },
  { id: "no-telemetry", path: "/admin/sem-telemetria" },
  { id: "reports", path: "/admin/relatorios" },
  { id: "fleet", path: "/admin/frota/avioes", aliases: FLEET_ROUTES.flatMap((route) => [route.path, ...(route.aliases ?? [])]) },
  { id: "maneuvers", path: "/admin/manobras" },
  { id: "manuals", path: "/admin/manuais" },
  { id: "users", path: "/admin/usuarios" },
  {
    id: "settings",
    path: "/admin/configuracoes",
    aliases: SETTINGS_ROUTES.flatMap((route) => [route.path, ...(route.aliases ?? [])]),
  },
] satisfies readonly TabRoute<AdminSection>[];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const [section, setSection] = useRoutedTab(ADMIN_ROUTES, "home");
  const openedSections = useOpenedTabs(section);
  const [fleetTab, setFleetTab] = useState<FleetSubTab>(() => resolveRouteId(FLEET_ROUTES, "aircraft"));
  const openedFleetTabs = useOpenedTabs(fleetTab);
  const [scheduleTab, setScheduleTab] = useState<ScheduleSubTab>(() => resolveRouteId(SCHEDULE_ROUTES, "flights"));
  const [settingsTab, setSettingsTab] = useState<SettingsSubTab>(() => resolveRouteId(SETTINGS_ROUTES, "email"));

  const activeNav = NAV_ITEMS.find((n) => n.id === section)!;

  useEffect(() => {
    const syncSubRoutes = () => {
      if (routeMatches(FLEET_ROUTES)) {
        setFleetTab(resolveRouteId(FLEET_ROUTES, "aircraft"));
      }
      if (routeMatches(SCHEDULE_ROUTES)) {
        setScheduleTab(resolveRouteId(SCHEDULE_ROUTES, "flights"));
      }
      if (routeMatches(SETTINGS_ROUTES)) {
        setSettingsTab(resolveRouteId(SETTINGS_ROUTES, "email"));
      }
    };

    syncSubRoutes();
    window.addEventListener("popstate", syncSubRoutes);
    return () => window.removeEventListener("popstate", syncSubRoutes);
  }, []);

  function openSection(target: AdminSection) {
    if (target === "fleet") {
      setSection(target, { path: pathForRoute(FLEET_ROUTES, fleetTab) });
      return;
    }
    if (target === "schedule") {
      setSection(target, { path: pathForRoute(SCHEDULE_ROUTES, scheduleTab) });
      return;
    }
    if (target === "settings") {
      setSection(target, { path: pathForRoute(SETTINGS_ROUTES, settingsTab) });
      return;
    }
    setSection(target);
  }

  function changeFleetTab(next: FleetSubTab) {
    setFleetTab(next);
    setSection("fleet", { path: pathForRoute(FLEET_ROUTES, next) });
  }

  function changeScheduleTab(next: ScheduleSubTab) {
    setScheduleTab(next);
    setSection("schedule", { path: pathForRoute(SCHEDULE_ROUTES, next) });
  }

  function changeSettingsTab(next: SettingsSubTab) {
    setSettingsTab(next);
    setSection("settings", { path: pathForRoute(SETTINGS_ROUTES, next) });
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-slate-800 bg-slate-950/80 lg:flex">
        {/* Brand */}
        <div className="border-b border-slate-800 px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
              Admin
            </span>
          </div>
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Controle Operacional</p>
          <p className="text-sm font-semibold text-slate-200">Gestão de Frota</p>
        </div>

        {/* Nav */}
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
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

        {/* User */}
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

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header */}
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {/* Mobile nav indicator */}
              <div className="flex items-center gap-2 lg:hidden">
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  Admin
                </span>
              </div>
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

        {/* Content */}
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-4 lg:pb-4">
          {openedSections.has("home") && (
            <div hidden={section !== "home"}>
              <AdminHome
                onOpenReports={() => openSection("reports")}
                onOpenAlerts={() => openSection("telemetry-alerts")}
                onOpenNoTelemetry={() => openSection("no-telemetry")}
              />
            </div>
          )}
          {openedSections.has("fleet") && (
            <div hidden={section !== "fleet"} className="space-y-4">
              <Tabs items={FLEET_TABS} value={fleetTab} onChange={changeFleetTab} ariaLabel="Subabas de frota" accent="sky" />
              {openedFleetTabs.has("aircraft") ? (
                <div hidden={fleetTab !== "aircraft"}>
                  <FleetTab />
                </div>
              ) : null}
              {openedFleetTabs.has("models") ? (
                <div hidden={fleetTab !== "models"}>
                  <ModelsTab />
                </div>
              ) : null}
              {openedFleetTabs.has("maintenance") ? (
                <div hidden={fleetTab !== "maintenance"}>
                  <MaintenanceTab />
                </div>
              ) : null}
            </div>
          )}
          {openedSections.has("telemetry-alerts") && (
            <div hidden={section !== "telemetry-alerts"}>
              <TelemetryAlertsTab />
            </div>
          )}
          {openedSections.has("schedule") && (
            <div hidden={section !== "schedule"}>
              <ScheduleAdminTab subTab={scheduleTab} onSubTabChange={changeScheduleTab} />
            </div>
          )}
          {openedSections.has("maneuvers") && (
            <div hidden={section !== "maneuvers"}>
              <ManobrasTab />
            </div>
          )}
          {openedSections.has("manuals") && (
            <div hidden={section !== "manuals"}>
              <ManuaisAdminTab />
            </div>
          )}
          {openedSections.has("no-telemetry") && (
            <div hidden={section !== "no-telemetry"}>
              <NoTelemetryTab />
            </div>
          )}
          {openedSections.has("reports") && (
            <div hidden={section !== "reports"}>
              <FlightReportsTab />
            </div>
          )}
          {openedSections.has("students") && (
            <div hidden={section !== "students"}>
              <AdminStudentsTab />
            </div>
          )}
          {openedSections.has("users") && (
            <div hidden={section !== "users"}>
              <AdminUsersTab />
            </div>
          )}
          {openedSections.has("settings") && (
            <div hidden={section !== "settings"}>
              <PlatformSettingsTab subTab={settingsTab} onSubTabChange={changeSettingsTab} />
            </div>
          )}
        </main>

        <nav className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="flex overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/95 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
            {NAV_ITEMS.map((item) => {
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openSection(item.id)}
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
