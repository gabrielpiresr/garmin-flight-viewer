import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Tabs } from "../ui/Tabs";
import { ContractLayoutsSection } from "./ContractLayoutsSection";
import { ContractEmitidosSection } from "./ContractEmitidosSection";
import { usePermissions } from "../../contexts/PermissionsContext";

type ContractsSubTab = "layouts" | "emitidos";

const CONTRACTS_TABS = [
  {
    id: "layouts" as ContractsSubTab,
    label: "Layouts",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z" />
        <path d="M5.25 5.25a3 3 0 00-3 3v10.5a3 3 0 003 3h10.5a3 3 0 003-3V13.5a.75.75 0 00-1.5 0v5.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V8.25a1.5 1.5 0 011.5-1.5h5.25a.75.75 0 000-1.5H5.25z" />
      </svg>
    ),
  },
  {
    id: "emitidos" as ContractsSubTab,
    label: "Contratos",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6zM13.5 3A1.5 1.5 0 0012 4.5h4.5A1.5 1.5 0 0015 3h-1.5z" clipRule="evenodd" />
        <path fillRule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V9.375zm4.5 2.625a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75zm-2.25 3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75zm-2.25 3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export function ContractsAdminTab() {
  const { user } = useAuth();
  const { canTab } = usePermissions();
  const [subTab, setSubTab] = useState<ContractsSubTab>("emitidos");

  const schoolId = user?.schoolId ?? "";
  const canLayouts = canTab("contracts.layouts");
  const canEmitidos = canTab("contracts.emitidos");
  const visibleTabs = CONTRACTS_TABS.filter((tab) =>
    tab.id === "layouts" ? canLayouts : canEmitidos,
  );
  const activeTab = visibleTabs.some((tab) => tab.id === subTab)
    ? subTab
    : (visibleTabs[0]?.id ?? "emitidos");

  return (
    <div className="space-y-4">
      <Tabs
        items={visibleTabs}
        value={activeTab}
        onChange={setSubTab}
        ariaLabel="Subabas de contratos"
        accent="sky"
      />
      {activeTab === "layouts" && canLayouts && <ContractLayoutsSection schoolId={schoolId} adminUserId={user?.id ?? ""} />}
      {activeTab === "emitidos" && canEmitidos && <ContractEmitidosSection schoolId={schoolId} adminUserId={user?.id ?? ""} />}
    </div>
  );
}
