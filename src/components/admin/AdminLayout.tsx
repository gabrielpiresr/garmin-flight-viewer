import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import {
  pathForRoute,
  resolveRouteId,
  routeMatches,
  useOpenedTabs,
  useRoutedTab,
  type TabRoute,
} from "../../lib/routedTabs";
import { PortalShellHeader } from "../PortalShellHeader";
import { PushNotificationsToggle } from "../PushNotificationsToggle";
import { InstallPwaButton } from "../InstallPwaButton";
import { Tabs } from "../ui/Tabs";
import type { SettingsSubTab } from "./PlatformSettingsTab";
import type { ScheduleSubTab } from "./ScheduleAdminTab";
import type { AdminTabKey } from "../../types/rolePermissions";

const AdminHome = lazy(() => import("./AdminHome").then((module) => ({ default: module.AdminHome })));
const AdminStudentsTab = lazy(() => import("./AdminStudentsTab").then((module) => ({ default: module.AdminStudentsTab })));
const AdminUsersTab = lazy(() => import("./AdminUsersTab").then((module) => ({ default: module.AdminUsersTab })));
const FleetTab = lazy(() => import("./FleetTab").then((module) => ({ default: module.FleetTab })));
const FlightReportsTab = lazy(() => import("./FlightReportsTab").then((module) => ({ default: module.FlightReportsTab })));
const AdminAllFlightsTab = lazy(() =>
  import("./AdminAllFlightsTab").then((module) => ({ default: module.AdminAllFlightsTab })),
);
const MaintenanceTab = lazy(() => import("./MaintenanceTab").then((module) => ({ default: module.MaintenanceTab })));
const MaintenanceProgramTab = lazy(() =>
  import("./MaintenanceProgramTab").then((module) => ({ default: module.MaintenanceProgramTab })),
);
const ManobrasTab = lazy(() => import("./ManobrasTab").then((module) => ({ default: module.ManobrasTab })));
const ManuaisAdminTab = lazy(() => import("./ManuaisAdminTab").then((module) => ({ default: module.ManuaisAdminTab })));
const ModelsTab = lazy(() => import("./ModelsTab").then((module) => ({ default: module.ModelsTab })));
const NoTelemetryTab = lazy(() => import("./NoTelemetryTab").then((module) => ({ default: module.NoTelemetryTab })));
const PlatformSettingsTab = lazy(() =>
  import("./PlatformSettingsTab").then((module) => ({ default: module.PlatformSettingsTab })),
);
const ScheduleAdminTab = lazy(() => import("./ScheduleAdminTab").then((module) => ({ default: module.ScheduleAdminTab })));
const TelemetryAlertsTab = lazy(() =>
  import("./TelemetryAlertsTab").then((module) => ({ default: module.TelemetryAlertsTab })),
);
const EmailMktTab = lazy(() => import("./EmailMktTab").then((module) => ({ default: module.EmailMktTab })));
const NoticesTab = lazy(() => import("./NoticesTab").then((module) => ({ default: module.NoticesTab })));
const HelpCenterAdminTab = lazy(() =>
  import("./HelpCenterAdminTab").then((module) => ({ default: module.HelpCenterAdminTab })),
);
const AdminSignaturesTab = lazy(() =>
  import("./AdminSignaturesTab").then((module) => ({ default: module.AdminSignaturesTab })),
);
const DiarioDeBordoTab = lazy(() =>
  import("./DiarioDeBordoTab").then((module) => ({ default: module.DiarioDeBordoTab })),
);
const FuelingsTab = lazy(() => import("../FuelingsTab").then((module) => ({ default: module.FuelingsTab })));
const AdminDreTab = lazy(() => import("./AdminDreTab").then((module) => ({ default: module.AdminDreTab })));
const FlightReviewAdminTab = lazy(() =>
  import("./FlightReviewAdminTab").then((module) => ({ default: module.FlightReviewAdminTab })),
);

type AdminSection =
  | "home"
  | "fleet"
  | "reports"
  | "contents"
  | "disparos"
  | "schedule"
  | "students"
  | "users"
  | "settings"
  | "logbook"
  | "fuelings"
  | "dre"
  | "flight-review";

type FleetSubTab = "aircraft" | "models" | "program" | "work-orders";
type ReportsSubTab = "all-flights" | "flight-reports" | "signatures" | "no-telemetry" | "alerts";
type ContentsSubTab = "maneuvers" | "manuals" | "help";
type DisparosSubTab = "email-mkt" | "notices";

type NavItem = {
  id: AdminSection;
  label: string;
  sublabel: string;
  icon: ReactNode;
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
    id: "reports",
    label: "Relatórios",
    sublabel: "Voos, assinaturas, alertas e telemetria",
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
    id: "contents",
    label: "Conteúdos",
    sublabel: "Manobras, manuais e central de ajuda",
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
    id: "disparos",
    label: "Disparos",
    sublabel: "Email marketing e avisos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
        <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 4.836a1.5 1.5 0 001.572 0L22.5 6.908z" />
      </svg>
    ),
  },
  {
    id: "logbook",
    label: "Diário de bordo",
    sublabel: "Registros ANAC por aeronave",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path
          fillRule="evenodd"
          d="M5.25 3A2.25 2.25 0 003 5.25v13.5A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V8.25a.75.75 0 00-.22-.53l-4.5-4.5A.75.75 0 0015.75 3H5.25zm1.5 6.75a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75zm0 3a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75zm0 3a.75.75 0 01.75-.75h5.25a.75.75 0 010 1.5H7.5a.75.75 0 01-.75-.75z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    id: "fuelings",
    label: "Abastecimentos",
    sublabel: "Combustível e pagamentos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M6.75 2.25A2.25 2.25 0 004.5 4.5v16.125c0 .621.504 1.125 1.125 1.125h7.5c.621 0 1.125-.504 1.125-1.125V4.5A2.25 2.25 0 0012 2.25H6.75zm.75 3a.75.75 0 01.75-.75h2.25a.75.75 0 01.75.75v4.5a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-4.5z" />
        <path d="M15.75 7.5a.75.75 0 011.28-.53l2.25 2.25a.75.75 0 01.22.53v7.875a1.125 1.125 0 102.25 0V12a2.25 2.25 0 00-.66-1.59l-2.03-2.03a2.25 2.25 0 01-.66-1.59V6a.75.75 0 00-1.5 0v.79c0 1 .397 1.961 1.105 2.669l1.995 1.995v6.171a2.625 2.625 0 11-5.25 0V7.5z" />
      </svg>
    ),
  },
  {
    id: "dre",
    label: "DRE",
    sublabel: "Relatorios financeiros",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M3.75 3A.75.75 0 003 3.75v16.5c0 .414.336.75.75.75h15.75a.75.75 0 000-1.5H4.5V3.75A.75.75 0 003.75 3z" />
        <path d="M7.5 15.75a.75.75 0 01-.75-.75v-3a.75.75 0 011.5 0v3a.75.75 0 01-.75.75zM12 15.75a.75.75 0 01-.75-.75V8.25a.75.75 0 011.5 0V15a.75.75 0 01-.75.75zM16.5 15.75a.75.75 0 01-.75-.75v-4.5a.75.75 0 011.5 0V15a.75.75 0 01-.75.75z" />
      </svg>
    ),
  },
  {
    id: "flight-review",
    label: "Flight Review",
    sublabel: "Templates de manobras e análise",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M2.25 2.25a.75.75 0 000 1.5H3v10.5a3 3 0 003 3h1.21l-1.172 3.513a.75.75 0 001.424.474l.329-.987h8.418l.33.987a.75.75 0 001.422-.474l-1.17-3.513H18a3 3 0 003-3V3.75h.75a.75.75 0 000-1.5H2.25zm6.04 16.5l.5-1.5h6.42l.5 1.5H8.29zm7.46-12a.75.75 0 00-1.5 0v6a.75.75 0 001.5 0v-6zm-3 2.25a.75.75 0 00-1.5 0v3.75a.75.75 0 001.5 0V9zm-3 3a.75.75 0 00-1.5 0v.75a.75.75 0 001.5 0V12z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Configurações",
    sublabel: "Regras, e-mails, exercícios e trilhas",
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
    id: "program",
    label: "Programa",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M5.625 3.75A2.625 2.625 0 003 6.375v11.25a2.625 2.625 0 002.625 2.625h12.75A2.625 2.625 0 0021 17.625V6.375a2.625 2.625 0 00-2.625-2.625H5.625zM6 7.5a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 7.5zm0 4.5a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 12zm.75 3.75a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-6z" />
      </svg>
    ),
  },
  {
    id: "work-orders",
    label: "Ordens de Serviço",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M12 6.75a5.25 5.25 0 016.775-5.025.75.75 0 01.313 1.248l-3.32 3.319c.063.475.276.934.641 1.299.365.365.824.578 1.3.641l3.318-3.319a.75.75 0 011.248.313 5.25 5.25 0 01-5.472 6.756c-1.018-.086-1.87.1-2.309.634L7.344 21.3A3.298 3.298 0 112.7 16.657l8.684-7.151c.533-.44.72-1.291.634-2.308A5.28 5.28 0 0112 6.75zM4.117 19.125a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008z" clipRule="evenodd" />
      </svg>
    ),
  },
] satisfies Array<{ id: FleetSubTab; label: string; icon: ReactNode }>;

const REPORTS_TABS = [
  {
    id: "all-flights",
    label: "Todos os voos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
      </svg>
    ),
  },
  {
    id: "flight-reports",
    label: "Relatórios",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M3.75 3A.75.75 0 003 3.75v16.5c0 .414.336.75.75.75h16.5a.75.75 0 000-1.5H4.5V3.75A.75.75 0 003.75 3z" />
        <path d="M8.25 17.25a.75.75 0 01-.75-.75v-4.25a.75.75 0 011.5 0v4.25a.75.75 0 01-.75.75zM12 17.25a.75.75 0 01-.75-.75V8.75a.75.75 0 011.5 0v7.75a.75.75 0 01-.75.75zM15.75 17.25a.75.75 0 01-.75-.75v-6a.75.75 0 011.5 0v6a.75.75 0 01-.75.75zM19.5 17.25a.75.75 0 01-.75-.75V6.75a.75.75 0 011.5 0v9.75a.75.75 0 01-.75.75z" />
      </svg>
    ),
  },
  {
    id: "signatures",
    label: "Assinaturas",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6zM13.5 3A1.5 1.5 0 0012 4.5h4.5A1.5 1.5 0 0015 3h-1.5z" clipRule="evenodd" />
        <path fillRule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V9.375zm4.5 2.625a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75zm-2.25 3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75zm-2.25 3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "no-telemetry",
    label: "Sem telemetria",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M12 2.25a.75.75 0 01.75.75v2.25a7.5 7.5 0 017.5 7.5H21a.75.75 0 010 1.5h-.75a7.5 7.5 0 01-7.5 7.5v2.25a.75.75 0 01-1.5 0v-2.25a7.5 7.5 0 01-7.5-7.5H3a.75.75 0 010-1.5h.75a7.5 7.5 0 017.5-7.5V3a.75.75 0 01.75-.75z" />
      </svg>
    ),
  },
  {
    id: "alerts",
    label: "Alertas",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.198 0l7.355 12.74c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.753-2.5-2.599-4.5l7.355-12.74zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
] satisfies Array<{ id: ReportsSubTab; label: string; icon: ReactNode }>;

const CONTENTS_TABS = [
  {
    id: "maneuvers",
    label: "Manobras",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 8.625a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM15.375 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zM7.5 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "manuals",
    label: "Manuais",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
      </svg>
    ),
  },
  {
    id: "help",
    label: "Central de Ajuda",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm11.378-3.917c-.89-.777-2.366-.777-3.255 0a.75.75 0 01-.988-1.129c1.454-1.272 3.776-1.272 5.23 0 1.513 1.324 1.513 3.518 0 4.842a3.75 3.75 0 01-.837.552c-.676.328-1.028.774-1.028 1.152v.75a.75.75 0 01-1.5 0v-.75c0-1.279 1.06-2.107 1.875-2.502.182-.088.351-.199.503-.331.83-.727.83-1.857 0-2.584zM12 18a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
      </svg>
    ),
  },
] satisfies Array<{ id: ContentsSubTab; label: string; icon: ReactNode }>;

const DISPAROS_TABS = [
  {
    id: "email-mkt",
    label: "Email MKT",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
        <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 4.836a1.5 1.5 0 001.572 0L22.5 6.908z" />
      </svg>
    ),
  },
  {
    id: "notices",
    label: "Avisos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" strokeWidth="1.5" stroke="currentColor" fill="none" />
      </svg>
    ),
  },
] satisfies Array<{ id: DisparosSubTab; label: string; icon: ReactNode }>;

const FLEET_ROUTES = [
  { id: "aircraft", path: "/admin/frota/avioes", aliases: ["/admin/frota", "/admin/fleet"] },
  { id: "models", path: "/admin/frota/modelos" },
  { id: "program", path: "/admin/frota/programa-manutencao" },
  { id: "work-orders", path: "/admin/frota/ordens-servico", aliases: ["/admin/frota/manutencoes"] },
] satisfies readonly TabRoute<FleetSubTab>[];

const SCHEDULE_ROUTES = [
  { id: "flights", path: "/admin/escala/voos", aliases: ["/admin/escala", "/admin/schedule"] },
  { id: "weekly", path: "/admin/escala/disponibilidades" },
  { id: "generator", path: "/admin/escala/gerador" },
] satisfies readonly TabRoute<ScheduleSubTab>[];

const REPORTS_ROUTES = [
  { id: "all-flights", path: "/admin/todos-os-voos", aliases: [] as string[] },
  { id: "flight-reports", path: "/admin/relatorios", aliases: [] as string[] },
  { id: "signatures", path: "/admin/assinaturas", aliases: [] as string[] },
  { id: "no-telemetry", path: "/admin/sem-telemetria", aliases: [] as string[] },
  { id: "alerts", path: "/admin/alertas", aliases: [] as string[] },
] satisfies readonly TabRoute<ReportsSubTab>[];

const CONTENTS_ROUTES = [
  { id: "maneuvers", path: "/admin/conteudos/manobras", aliases: ["/admin/manobras"] },
  { id: "manuals", path: "/admin/conteudos/manuais", aliases: ["/admin/manuais"] },
  { id: "help", path: "/admin/conteudos/central-ajuda", aliases: ["/admin/configuracoes/central-ajuda"] },
] satisfies readonly TabRoute<ContentsSubTab>[];

const DISPAROS_ROUTES = [
  { id: "email-mkt", path: "/admin/disparos/email-mkt", aliases: ["/admin/email-mkt"] },
  { id: "notices", path: "/admin/disparos/avisos", aliases: ["/admin/configuracoes/avisos", "/admin/avisos"] },
] satisfies readonly TabRoute<DisparosSubTab>[];

const SETTINGS_ROUTES = [
  { id: "rules", path: "/admin/configuracoes", aliases: ["/admin/configuracoes/regras"] },
  { id: "email", path: "/admin/configuracoes/email" },
  { id: "brand", path: "/admin/configuracoes/aparencia" },
  { id: "badges", path: "/admin/configuracoes/badges" },
  { id: "tracks", path: "/admin/configuracoes/trilhas" },
  { id: "exercises", path: "/admin/configuracoes/exercicios", aliases: ["/admin/exercicios"] },
  { id: "financeiro", path: "/admin/configuracoes/financeiro" },
  { id: "roles", path: "/admin/configuracoes/roles" },
] satisfies readonly TabRoute<SettingsSubTab>[];

const ADMIN_ROUTES = [
  { id: "home", path: "/admin" },
  { id: "schedule", path: "/admin/escala/voos", aliases: SCHEDULE_ROUTES.flatMap((r) => [r.path, ...(r.aliases ?? [])]) },
  { id: "students", path: "/admin/alunos" },
  { id: "reports", path: "/admin/relatorios", aliases: REPORTS_ROUTES.flatMap((r) => [r.path, ...(r.aliases ?? [])]) },
  { id: "fleet", path: "/admin/frota/avioes", aliases: FLEET_ROUTES.flatMap((r) => [r.path, ...(r.aliases ?? [])]) },
  { id: "contents", path: "/admin/conteudos/manobras", aliases: CONTENTS_ROUTES.flatMap((r) => [r.path, ...(r.aliases ?? [])]) },
  { id: "users", path: "/admin/usuarios" },
  { id: "disparos", path: "/admin/disparos/email-mkt", aliases: DISPAROS_ROUTES.flatMap((r) => [r.path, ...(r.aliases ?? [])]) },
  { id: "logbook", path: "/admin/diario-de-bordo" },
  { id: "fuelings", path: "/admin/abastecimentos" },
  { id: "dre", path: "/admin/dre" },
  { id: "flight-review", path: "/admin/flight-review" },
  { id: "settings", path: "/admin/configuracoes", aliases: SETTINGS_ROUTES.flatMap((r) => [r.path, ...(r.aliases ?? [])]) },
] satisfies readonly TabRoute<AdminSection>[];

const SCHEDULE_TAB_LABELS: Record<ScheduleSubTab, string> = {
  flights: "Escala",
  weekly: "Disponibilidades",
  generator: "Gerador",
};

const SETTINGS_TAB_LABELS: Record<SettingsSubTab, string> = {
  rules: "Regras",
  email: "E-mail",
  brand: "Aparencia",
  badges: "Badges",
  tracks: "Trilhas",
  exercises: "Exercicios",
  financeiro: "Financeiro",
  roles: "Roles",
};

// Mapeamento de sub-tabs locais para chaves de AdminTabKey (para permissionamento)
const FLEET_TAB_KEYS: Record<string, AdminTabKey> = {
  aircraft: "fleet.avioes",
  models: "fleet.modelos",
  program: "fleet.programa",
  "work-orders": "fleet.ordens-servico",
};
const REPORTS_TAB_KEYS: Record<string, AdminTabKey> = {
  "all-flights": "reports.all-flights",
  "flight-reports": "reports.relatorios",
  signatures: "reports.assinaturas",
  "no-telemetry": "reports.sem-telemetria",
  alerts: "reports.alertas",
};
const CONTENTS_TAB_KEYS: Record<string, AdminTabKey> = {
  maneuvers: "contents.manobras",
  manuals: "contents.manuais",
  help: "contents.ajuda",
};
const DISPAROS_TAB_KEYS: Record<string, AdminTabKey> = {
  "email-mkt": "disparos.email-mkt",
  notices: "disparos.avisos",
};

function resolveAdminPageTitle(
  section: AdminSection,
  fleetTab: FleetSubTab,
  scheduleTab: ScheduleSubTab,
  reportsTab: ReportsSubTab,
  contentsTab: ContentsSubTab,
  disparosTab: DisparosSubTab,
  settingsTab: SettingsSubTab,
  fallback: string,
): string {
  switch (section) {
    case "fleet":
      return FLEET_TABS.find((tab) => tab.id === fleetTab)?.label ?? fallback;
    case "schedule":
      return SCHEDULE_TAB_LABELS[scheduleTab] ?? fallback;
    case "reports":
      return REPORTS_TABS.find((tab) => tab.id === reportsTab)?.label ?? fallback;
    case "contents":
      return CONTENTS_TABS.find((tab) => tab.id === contentsTab)?.label ?? fallback;
    case "disparos":
      return DISPAROS_TABS.find((tab) => tab.id === disparosTab)?.label ?? fallback;
    case "settings":
      return SETTINGS_TAB_LABELS[settingsTab] ?? fallback;
    default:
      return fallback;
  }
}

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

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const { canTab, isLoading: permissionsLoading } = usePermissions();
  const [section, setSection] = useRoutedTab(ADMIN_ROUTES, "home");
  const openedSections = useOpenedTabs(section);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Filtra itens de navegação pelas permissões do role
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => canTab(item.id as AdminTabKey)),
    [canTab],
  );

  // Filtra sub-tabs de cada seção
  const visibleFleetTabs = useMemo(
    () => FLEET_TABS.filter((t) => canTab(FLEET_TAB_KEYS[t.id] ?? ("fleet.avioes" as AdminTabKey))),
    [canTab],
  );
  const visibleReportsTabs = useMemo(
    () => REPORTS_TABS.filter((t) => canTab(REPORTS_TAB_KEYS[t.id] ?? ("reports.relatorios" as AdminTabKey))),
    [canTab],
  );
  const visibleContentsTabs = useMemo(
    () => CONTENTS_TABS.filter((t) => canTab(CONTENTS_TAB_KEYS[t.id] ?? ("contents.manobras" as AdminTabKey))),
    [canTab],
  );
  const visibleDisparosTabs = useMemo(
    () => DISPAROS_TABS.filter((t) => canTab(DISPAROS_TAB_KEYS[t.id] ?? ("disparos.email-mkt" as AdminTabKey))),
    [canTab],
  );
  const [fleetTab, setFleetTab] = useState<FleetSubTab>(() => resolveRouteId(FLEET_ROUTES, "aircraft"));
  const openedFleetTabs = useOpenedTabs(fleetTab);
  const [scheduleTab, setScheduleTab] = useState<ScheduleSubTab>(() => resolveRouteId(SCHEDULE_ROUTES, "flights"));
  const [reportsTab, setReportsTab] = useState<ReportsSubTab>(() => resolveRouteId(REPORTS_ROUTES, "all-flights"));
  const openedReportsTabs = useOpenedTabs(reportsTab);
  const [contentsTab, setContentsTab] = useState<ContentsSubTab>(() => resolveRouteId(CONTENTS_ROUTES, "maneuvers"));
  const openedContentsTabs = useOpenedTabs(contentsTab);
  const [disparosTab, setDisparosTab] = useState<DisparosSubTab>(() => resolveRouteId(DISPAROS_ROUTES, "email-mkt"));
  const openedDisparosTabs = useOpenedTabs(disparosTab);
  const [settingsTab, setSettingsTab] = useState<SettingsSubTab>(() => resolveRouteId(SETTINGS_ROUTES, "rules"));

  const activeNav = NAV_ITEMS.find((n) => n.id === section)!;
  const pageTitle = resolveAdminPageTitle(
    section,
    fleetTab,
    scheduleTab,
    reportsTab,
    contentsTab,
    disparosTab,
    settingsTab,
    activeNav.label,
  );

  useEffect(() => {
    const syncSubRoutes = () => {
      if (routeMatches(FLEET_ROUTES)) setFleetTab(resolveRouteId(FLEET_ROUTES, "aircraft"));
      if (routeMatches(SCHEDULE_ROUTES)) setScheduleTab(resolveRouteId(SCHEDULE_ROUTES, "flights"));
      if (routeMatches(REPORTS_ROUTES)) setReportsTab(resolveRouteId(REPORTS_ROUTES, "all-flights"));
      if (routeMatches(CONTENTS_ROUTES)) setContentsTab(resolveRouteId(CONTENTS_ROUTES, "maneuvers"));
      if (routeMatches(DISPAROS_ROUTES)) setDisparosTab(resolveRouteId(DISPAROS_ROUTES, "email-mkt"));
      if (routeMatches(SETTINGS_ROUTES)) setSettingsTab(resolveRouteId(SETTINGS_ROUTES, "rules"));
    };
    syncSubRoutes();
    window.addEventListener("popstate", syncSubRoutes);
    return () => window.removeEventListener("popstate", syncSubRoutes);
  }, []);

  function openSection(target: AdminSection) {
    if (target === "fleet") { setSection(target, { path: pathForRoute(FLEET_ROUTES, fleetTab) }); return; }
    if (target === "schedule") { setSection(target, { path: pathForRoute(SCHEDULE_ROUTES, scheduleTab) }); return; }
    if (target === "reports") { setSection(target, { path: pathForRoute(REPORTS_ROUTES, reportsTab) }); return; }
    if (target === "contents") { setSection(target, { path: pathForRoute(CONTENTS_ROUTES, contentsTab) }); return; }
    if (target === "disparos") { setSection(target, { path: pathForRoute(DISPAROS_ROUTES, disparosTab) }); return; }
    if (target === "settings") { setSection(target, { path: pathForRoute(SETTINGS_ROUTES, settingsTab) }); return; }
    setSection(target);
  }

  function openReportsSection(subTab: ReportsSubTab) {
    setReportsTab(subTab);
    setSection("reports", { path: pathForRoute(REPORTS_ROUTES, subTab) });
  }

  function changeFleetTab(next: FleetSubTab) { setFleetTab(next); setSection("fleet", { path: pathForRoute(FLEET_ROUTES, next) }); }
  function changeScheduleTab(next: ScheduleSubTab) { setScheduleTab(next); setSection("schedule", { path: pathForRoute(SCHEDULE_ROUTES, next) }); }
  function changeReportsTab(next: ReportsSubTab) { setReportsTab(next); setSection("reports", { path: pathForRoute(REPORTS_ROUTES, next) }); }
  function changeContentsTab(next: ContentsSubTab) { setContentsTab(next); setSection("contents", { path: pathForRoute(CONTENTS_ROUTES, next) }); }
  function changeDisparosTab(next: DisparosSubTab) { setDisparosTab(next); setSection("disparos", { path: pathForRoute(DISPAROS_ROUTES, next) }); }
  function changeSettingsTab(next: SettingsSubTab) { setSettingsTab(next); setSection("settings", { path: pathForRoute(SETTINGS_ROUTES, next) }); }

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className={`sticky top-0 hidden h-screen flex-col border-r border-slate-800 bg-slate-950/80 transition-[width] duration-200 lg:flex ${sidebarCollapsed ? "w-20" : "w-64"}`}>
        <div className={`border-b border-slate-800 py-5 ${sidebarCollapsed ? "px-3" : "px-5"}`}>
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between gap-3"}`}>
            <span className={`${sidebarCollapsed ? "hidden" : ""} rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400`}>
              Admin
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
          <p className={`${sidebarCollapsed ? "hidden" : ""} mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500`}>Controle Operacional</p>
          <p className={`${sidebarCollapsed ? "hidden" : ""} text-sm font-semibold text-slate-200`}>Gestão de Frota</p>
        </div>

        <nav className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-4 ${sidebarCollapsed ? "px-2" : "px-3"}`}>
          {permissionsLoading ? (
            // Skeleton enquanto permissões do role customizado carregam
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex items-center rounded-lg py-2.5 ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3"}`}>
                <div className="h-4 w-4 animate-pulse rounded bg-slate-800" />
                {!sidebarCollapsed ? <div className="h-3 w-24 animate-pulse rounded bg-slate-800" /> : null}
              </div>
            ))
          ) : visibleNavItems.map((item) => {
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
        </nav>

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

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
            <PortalShellHeader
              roleLabel="Admin"
              roleBadgeClassName="bg-amber-500/20 text-amber-400"
              title={pageTitle}
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

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-4 lg:pb-4">
          {openedSections.has("home") && (
            <div hidden={section !== "home"}>
              <LazyTab>
                <AdminHome
                  onOpenReports={() => openReportsSection("flight-reports")}
                  onOpenAlerts={() => openReportsSection("alerts")}
                  onOpenNoTelemetry={() => openReportsSection("no-telemetry")}
                />
              </LazyTab>
            </div>
          )}
          {openedSections.has("fleet") && (
            <div hidden={section !== "fleet"} className="space-y-4">
              <Tabs items={visibleFleetTabs} value={fleetTab} onChange={changeFleetTab} ariaLabel="Subabas de frota" accent="sky" />
              {openedFleetTabs.has("aircraft") ? (
                <div hidden={fleetTab !== "aircraft"}><LazyTab><FleetTab /></LazyTab></div>
              ) : null}
              {openedFleetTabs.has("models") ? (
                <div hidden={fleetTab !== "models"}><LazyTab><ModelsTab /></LazyTab></div>
              ) : null}
              {openedFleetTabs.has("program") ? (
                <div hidden={fleetTab !== "program"}><LazyTab><MaintenanceProgramTab /></LazyTab></div>
              ) : null}
              {openedFleetTabs.has("work-orders") ? (
                <div hidden={fleetTab !== "work-orders"}><LazyTab><MaintenanceTab /></LazyTab></div>
              ) : null}
            </div>
          )}
          {openedSections.has("reports") && (
            <div hidden={section !== "reports"} className="space-y-4">
              <Tabs items={visibleReportsTabs} value={reportsTab} onChange={changeReportsTab} ariaLabel="Subabas de relatórios" accent="sky" />
              {openedReportsTabs.has("all-flights") ? (
                <div hidden={reportsTab !== "all-flights"}><LazyTab><AdminAllFlightsTab /></LazyTab></div>
              ) : null}
              {openedReportsTabs.has("flight-reports") ? (
                <div hidden={reportsTab !== "flight-reports"}><LazyTab><FlightReportsTab /></LazyTab></div>
              ) : null}
              {openedReportsTabs.has("signatures") ? (
                <div hidden={reportsTab !== "signatures"}><LazyTab><AdminSignaturesTab /></LazyTab></div>
              ) : null}
              {openedReportsTabs.has("no-telemetry") ? (
                <div hidden={reportsTab !== "no-telemetry"}><LazyTab><NoTelemetryTab /></LazyTab></div>
              ) : null}
              {openedReportsTabs.has("alerts") ? (
                <div hidden={reportsTab !== "alerts"}><LazyTab><TelemetryAlertsTab /></LazyTab></div>
              ) : null}
            </div>
          )}
          {openedSections.has("contents") && (
            <div hidden={section !== "contents"} className="space-y-4">
              <Tabs items={visibleContentsTabs} value={contentsTab} onChange={changeContentsTab} ariaLabel="Subabas de conteúdos" accent="sky" />
              {openedContentsTabs.has("maneuvers") ? (
                <div hidden={contentsTab !== "maneuvers"}><LazyTab><ManobrasTab /></LazyTab></div>
              ) : null}
              {openedContentsTabs.has("manuals") ? (
                <div hidden={contentsTab !== "manuals"}><LazyTab><ManuaisAdminTab /></LazyTab></div>
              ) : null}
              {openedContentsTabs.has("help") ? (
                <div hidden={contentsTab !== "help"}><LazyTab><HelpCenterAdminTab /></LazyTab></div>
              ) : null}
            </div>
          )}
          {openedSections.has("disparos") && (
            <div hidden={section !== "disparos"} className="space-y-4">
              <Tabs items={visibleDisparosTabs} value={disparosTab} onChange={changeDisparosTab} ariaLabel="Subabas de disparos" accent="sky" />
              {openedDisparosTabs.has("email-mkt") ? (
                <div hidden={disparosTab !== "email-mkt"}><LazyTab><EmailMktTab /></LazyTab></div>
              ) : null}
              {openedDisparosTabs.has("notices") ? (
                <div hidden={disparosTab !== "notices"}><LazyTab><NoticesTab /></LazyTab></div>
              ) : null}
            </div>
          )}
          {openedSections.has("schedule") && (
            <div hidden={section !== "schedule"}>
              <LazyTab>
                <ScheduleAdminTab subTab={scheduleTab} onSubTabChange={changeScheduleTab} />
              </LazyTab>
            </div>
          )}
          {openedSections.has("students") && (
            <div hidden={section !== "students"}><LazyTab><AdminStudentsTab /></LazyTab></div>
          )}
          {openedSections.has("users") && (
            <div hidden={section !== "users"}><LazyTab><AdminUsersTab /></LazyTab></div>
          )}
          {openedSections.has("settings") && (
            <div hidden={section !== "settings"}>
              <LazyTab>
                <PlatformSettingsTab subTab={settingsTab} onSubTabChange={changeSettingsTab} />
              </LazyTab>
            </div>
          )}
          {openedSections.has("logbook") && (
            <div hidden={section !== "logbook"}><LazyTab><DiarioDeBordoTab /></LazyTab></div>
          )}
          {openedSections.has("fuelings") && (
            <div hidden={section !== "fuelings"}><LazyTab><FuelingsTab /></LazyTab></div>
          )}
          {openedSections.has("dre") && (
            <div hidden={section !== "dre"}><LazyTab><AdminDreTab /></LazyTab></div>
          )}
          {openedSections.has("flight-review") && (
            <div hidden={section !== "flight-review"}><LazyTab><FlightReviewAdminTab /></LazyTab></div>
          )}
        </main>

        <nav className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="flex overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/95 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
            {permissionsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex min-w-[4.75rem] flex-1 flex-col items-center gap-1.5 px-2 py-2">
                  <div className="h-4 w-4 animate-pulse rounded bg-slate-800" />
                  <div className="h-2 w-10 animate-pulse rounded bg-slate-800" />
                </div>
              ))
            ) : visibleNavItems.map((item) => {
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
