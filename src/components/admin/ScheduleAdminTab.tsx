import { useState } from "react";
import type { ReactNode } from "react";
import { ScheduleFlightsTab } from "./ScheduleFlightsTab";
import { WeeklyConfigTab } from "./WeeklyConfigTab";
import { ScheduleGenerationTab } from "./ScheduleGenerationTab";
import { Tabs } from "../ui/Tabs";
import { useOpenedTabs } from "../../lib/routedTabs";

export type ScheduleSubTab = "flights" | "weekly" | "generator";

const SUB_TABS: Array<{ id: ScheduleSubTab; label: string; icon: ReactNode }> = [
  {
    id: "flights",
    label: "Escala",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 4.75A1.75 1.75 0 014.75 3h10.5A1.75 1.75 0 0117 4.75v10.5A1.75 1.75 0 0115.25 17H4.75A1.75 1.75 0 013 15.25V4.75zM5 7h10V5H5v2zm0 2v6h10V9H5z" />
      </svg>
    ),
  },
  {
    id: "weekly",
    label: "Disponibilidades",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 2a.75.75 0 01.75.75V4h3.5A1.75 1.75 0 0116 5.75v8.5A1.75 1.75 0 0114.25 16h-8.5A1.75 1.75 0 014 14.25v-8.5A1.75 1.75 0 015.75 4h3.5V2.75A.75.75 0 0110 2zm-4.25 8.25v4h8.5v-4h-8.5zM5.75 5.5v3.25h8.5V5.5h-8.5z" />
      </svg>
    ),
  },
  {
    id: "generator",
    label: "Gerador",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14A1 1 0 003 18h14a1 1 0 00.894-1.447l-7-14zM10 6.5l4.382 8.764H5.618L10 6.5z" />
      </svg>
    ),
  },
];

type ScheduleAdminTabProps = {
  subTab?: ScheduleSubTab;
  onSubTabChange?: (tab: ScheduleSubTab) => void;
};

export function ScheduleAdminTab({ subTab: controlledSubTab, onSubTabChange }: ScheduleAdminTabProps = {}) {
  const [internalSubTab, setInternalSubTab] = useState<ScheduleSubTab>("flights");
  const [flightsFocusWeekStart, setFlightsFocusWeekStart] = useState<string | null>(null);
  const subTab = controlledSubTab ?? internalSubTab;
  const openedSubTabs = useOpenedTabs(subTab);

  function changeSubTab(next: ScheduleSubTab) {
    if (onSubTabChange) {
      onSubTabChange(next);
      return;
    }
    setInternalSubTab(next);
  }

  function handleScalePublished(weekStart: string) {
    setFlightsFocusWeekStart(weekStart);
    changeSubTab("flights");
  }

  return (
    <div className="space-y-4">
      <Tabs
        items={SUB_TABS}
        value={subTab}
        onChange={changeSubTab}
        ariaLabel="Administração de escala"
        className="w-full"
      />

      {openedSubTabs.has("flights") ? (
        <div hidden={subTab !== "flights"}>
          <ScheduleFlightsTab
            focusWeekStart={flightsFocusWeekStart}
            onFocusWeekConsumed={() => setFlightsFocusWeekStart(null)}
          />
        </div>
      ) : null}
      {openedSubTabs.has("weekly") ? (
        <div hidden={subTab !== "weekly"}>
          <WeeklyConfigTab />
        </div>
      ) : null}
      {openedSubTabs.has("generator") ? (
        <div hidden={subTab !== "generator"}>
          <ScheduleGenerationTab onScalePublished={handleScalePublished} />
        </div>
      ) : null}
    </div>
  );
}
