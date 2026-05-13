import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { PushNotificationsToggle } from "../PushNotificationsToggle";
import { ModelsTab } from "./ModelsTab";
import { FleetTab } from "./FleetTab";
import { MaintenanceTab } from "./MaintenanceTab";
import { ManobrasTab } from "./ManobrasTab";
import { NoticesTab } from "./NoticesTab";
import { PlatformSettingsTab } from "./PlatformSettingsTab";
import { ScheduleAdminTab } from "./ScheduleAdminTab";
import { AdminUsersTab } from "./AdminUsersTab";
import { TrainingExercisesTab } from "./TrainingExercisesTab";

type AdminSection =
  | "models"
  | "fleet"
  | "maintenance"
  | "schedule"
  | "notices"
  | "maneuvers"
  | "exercises"
  | "users"
  | "settings";

type NavItem = {
  id: AdminSection;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
};

const SELECTED_NAV_CLASS = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";

const NAV_ITEMS: NavItem[] = [
  {
    id: "models",
    label: "Modelos",
    sublabel: "Tipos de aeronave",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.644 1.59a.75.75 0 01.712 0l9.75 5.25a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l9.75-5.25z" />
        <path d="M3.265 10.602l7.668 4.129a2.25 2.25 0 002.134 0l7.668-4.13 1.37.739a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.71 0l-9.75-5.25a.75.75 0 010-1.32l1.37-.738z" />
        <path d="M10.933 19.231l-7.668-4.13-1.37.739a.75.75 0 000 1.32l9.75 5.25c.221.12.489.12.71 0l9.75-5.25a.75.75 0 000-1.32l-1.37-.738-7.668 4.13a2.25 2.25 0 01-2.134-.001z" />
      </svg>
    ),
  },
  {
    id: "fleet",
    label: "Frota",
    sublabel: "Aeronaves da escola",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
      </svg>
    ),
  },
  {
    id: "maintenance",
    label: "Manutenções",
    sublabel: "Regras por modelo",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M12 6.75a5.25 5.25 0 016.775-5.025.75.75 0 01.313 1.248l-3.32 3.319c.063.475.276.934.641 1.299.365.365.824.578 1.3.641l3.318-3.319a.75.75 0 011.248.313 5.25 5.25 0 01-5.472 6.756c-1.018-.086-1.87.1-2.309.634L7.344 21.3A3.298 3.298 0 112.7 16.657l8.684-7.151c.533-.44.72-1.291.634-2.308A5.28 5.28 0 0112 6.75zM4.117 19.125a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "schedule",
    label: "Escala",
    sublabel: "Escala, config semanal e gerador",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v.75h9V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v10.5a3 3 0 01-3 3H5.25a3 3 0 01-3-3V6.75a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm-3 5.25a1.5 1.5 0 011.5-1.5h13.5a1.5 1.5 0 011.5 1.5v.75H3.75V7.5zm4.5 4.5a.75.75 0 000 1.5h2.25V15a.75.75 0 001.5 0v-1.5h2.25a.75.75 0 000-1.5H12V10.5a.75.75 0 00-1.5 0V12H8.25z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "notices",
    label: "Avisos",
    sublabel: "Feed da home do aluno",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M1.5 8.67c0-1.213.84-2.266 2.024-2.49l13.5-2.56a2.25 2.25 0 012.669 2.21v12.34a2.25 2.25 0 01-2.67 2.21l-13.5-2.56A2.532 2.532 0 011.5 15.33V8.67z" />
        <path d="M20.25 8.99a.75.75 0 011.5 0v5.02a.75.75 0 01-1.5 0V8.99z" />
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
    id: "exercises",
    label: "Exercicios",
    sublabel: "Notas e proficiencia da ficha",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93v11.986c0 1.47-1.073 2.756-2.57 2.93a49.255 49.255 0 01-11.36 0c-1.497-.174-2.57-1.46-2.57-2.93V5.507c0-1.47 1.073-2.756 2.57-2.93zM8.25 6.75A.75.75 0 019 6h6a.75.75 0 010 1.5H9a.75.75 0 01-.75-.75zM9 10.5a.75.75 0 000 1.5h6a.75.75 0 000-1.5H9zm-.75 5.25A.75.75 0 019 15h3a.75.75 0 010 1.5H9a.75.75 0 01-.75-.75z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "users",
    label: "Usuarios",
    sublabel: "Perfis, permissões e voos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-1.083 1.881 10.088 10.088 0 004.884-1.233.75.75 0 00.367-.614 5.625 5.625 0 00-6.39-5.57 8.956 8.956 0 012.223 5.392z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Configuracoes",
    sublabel: "Email, push e plataforma",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567l-.108.648a7.52 7.52 0 00-1.705.707l-.535-.38a1.875 1.875 0 00-2.413.205l-.47.47a1.875 1.875 0 00-.205 2.413l.38.535a7.52 7.52 0 00-.707 1.705l-.648.108A1.875 1.875 0 001.25 12.078v.844c0 .917.663 1.699 1.567 1.85l.648.108c.173.603.412 1.174.707 1.705l-.38.535a1.875 1.875 0 00.205 2.413l.47.47c.648.648 1.67.735 2.413.205l.535-.38a7.52 7.52 0 001.705.707l.108.648a1.875 1.875 0 001.85 1.567h.844c.917 0 1.699-.663 1.85-1.567l.108-.648a7.52 7.52 0 001.705-.707l.535.38a1.875 1.875 0 002.413-.205l.47-.47c.648-.648.735-1.67.205-2.413l-.38-.535a7.52 7.52 0 00.707-1.705l.648-.108a1.875 1.875 0 001.567-1.85v-.844c0-.917-.663-1.699-1.567-1.85l-.648-.108a7.52 7.52 0 00-.707-1.705l.38-.535a1.875 1.875 0 00-.205-2.413l-.47-.47a1.875 1.875 0 00-2.413-.205l-.535.38a7.52 7.52 0 00-1.705-.707l-.108-.648a1.875 1.875 0 00-1.85-1.567h-.844zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const [section, setSection] = useState<AdminSection>("fleet");

  const activeNav = NAV_ITEMS.find((n) => n.id === section)!;

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-950/80 lg:flex">
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
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
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
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-6 lg:pb-6">
          {section === "models" && <ModelsTab />}
          {section === "fleet" && <FleetTab />}
          {section === "maintenance" && <MaintenanceTab />}
          {section === "schedule" && <ScheduleAdminTab />}
          {section === "notices" && <NoticesTab />}
          {section === "maneuvers" && <ManobrasTab />}
          {section === "exercises" && <TrainingExercisesTab />}
          {section === "users" && <AdminUsersTab />}
          {section === "settings" && <PlatformSettingsTab />}
        </main>

        <nav className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="flex overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/95 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
            {NAV_ITEMS.map((item) => {
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
