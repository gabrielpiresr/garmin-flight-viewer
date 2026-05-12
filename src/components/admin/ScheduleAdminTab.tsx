import { useState } from "react";
import type { ReactNode } from "react";
import { ScheduleFlightsTab } from "./ScheduleFlightsTab";
import { WeeklyConfigTab } from "./WeeklyConfigTab";
import { ScheduleGenerationTab } from "./ScheduleGenerationTab";

type ScheduleSubTab = "flights" | "weekly" | "generator";

const SUB_TABS: Array<{ id: ScheduleSubTab; label: string; description: string; icon: ReactNode }> = [
  {
    id: "flights",
    label: "Escala",
    description: "Voos já marcados",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 4.75A1.75 1.75 0 014.75 3h10.5A1.75 1.75 0 0117 4.75v10.5A1.75 1.75 0 0115.25 17H4.75A1.75 1.75 0 013 15.25V4.75zM5 7h10V5H5v2zm0 2v6h10V9H5z" />
      </svg>
    ),
  },
  {
    id: "weekly",
    label: "Disponibilidades",
    description: "Matriz operacional",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 2a.75.75 0 01.75.75V4h3.5A1.75 1.75 0 0116 5.75v8.5A1.75 1.75 0 0114.25 16h-8.5A1.75 1.75 0 014 14.25v-8.5A1.75 1.75 0 015.75 4h3.5V2.75A.75.75 0 0110 2zm-4.25 8.25v4h8.5v-4h-8.5zM5.75 5.5v3.25h8.5V5.5h-8.5z" />
      </svg>
    ),
  },
  {
    id: "generator",
    label: "Gerador",
    description: "Preview e fechamento",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14A1 1 0 003 18h14a1 1 0 00.894-1.447l-7-14zM10 6.5l4.382 8.764H5.618L10 6.5z" />
      </svg>
    ),
  },
];

export function ScheduleAdminTab() {
  const [subTab, setSubTab] = useState<ScheduleSubTab>("flights");
  const active = SUB_TABS.find((tab) => tab.id === subTab)!;

  return (
    <div className="space-y-4">
      <section className="mx-auto max-w-7xl rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
        <div className="flex flex-wrap justify-start gap-2">
          {SUB_TABS.map((tab) => {
            const isActive = tab.id === subTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  isActive
                    ? "border-violet-500/40 bg-violet-500/20 text-violet-100"
                    : "border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">{active.description}</p>
      </section>

      {subTab === "flights" ? <ScheduleFlightsTab /> : null}
      {subTab === "weekly" ? <WeeklyConfigTab /> : null}
      {subTab === "generator" ? <ScheduleGenerationTab /> : null}
    </div>
  );
}
