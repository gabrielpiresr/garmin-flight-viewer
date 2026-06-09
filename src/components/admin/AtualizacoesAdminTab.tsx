import { useState, type ReactNode } from "react";
import { useOpenedTabs } from "../../lib/routedTabs";
import { Tabs } from "../ui/Tabs";
import { AgendamentosAdminTab } from "./AgendamentosAdminTab";

export type AtualizacoesSubTab = "agendamentos";

const SUB_TABS: Array<{ id: AtualizacoesSubTab; label: string; icon: ReactNode }> = [
  {
    id: "agendamentos",
    label: "Agendamentos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v.75h9V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v10.5a3 3 0 01-3 3H5.25a3 3 0 01-3-3V6.75a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm-3 5.25a1.5 1.5 0 011.5-1.5h13.5a1.5 1.5 0 011.5 1.5v.75H3.75V7.5z" clipRule="evenodd" />
      </svg>
    ),
  },
];

type Props = {
  subTab?: AtualizacoesSubTab;
  onSubTabChange?: (tab: AtualizacoesSubTab) => void;
};

export function AtualizacoesAdminTab({ subTab, onSubTabChange }: Props) {
  const [internalTab, setInternalTab] = useState<AtualizacoesSubTab>("agendamentos");
  const activeTab = subTab ?? internalTab;
  const openedTabs = useOpenedTabs(activeTab);

  function changeTab(next: AtualizacoesSubTab) {
    if (onSubTabChange) { onSubTabChange(next); return; }
    setInternalTab(next);
  }

  return (
    <div className="space-y-4">
      <Tabs items={SUB_TABS} value={activeTab} onChange={changeTab} ariaLabel="Subabas de atualizações" accent="sky" />
      {openedTabs.has("agendamentos") && (
        <div hidden={activeTab !== "agendamentos"}>
          <AgendamentosAdminTab />
        </div>
      )}
    </div>
  );
}
