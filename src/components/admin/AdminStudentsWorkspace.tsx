import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Tabs } from "../ui/Tabs";
import { Skeleton } from "../ui/Skeleton";
import { usePermissions } from "../../contexts/PermissionsContext";

const AdminStudentsTab = lazy(() =>
  import("./AdminStudentsTab").then((module) => ({
    default: module.AdminStudentsTab,
  })),
);
const StudentAutomationsTab = lazy(() =>
  import("./StudentAutomationsTab").then((module) => ({
    default: module.StudentAutomationsTab,
  })),
);
const AutomationEmailTemplatesTab = lazy(() =>
  import("./AutomationEmailTemplatesTab").then((module) => ({
    default: module.AutomationEmailTemplatesTab,
  })),
);
const AutomationHistoryTab = lazy(() =>
  import("./AutomationHistoryTab").then((module) => ({
    default: module.AutomationHistoryTab,
  })),
);
const StudentCrmStatusesTab = lazy(() =>
  import("./StudentCrmStatusesTab").then((module) => ({
    default: module.StudentCrmStatusesTab,
  })),
);

type StudentWorkspaceTab =
  | "overview"
  | "automations"
  | "templates"
  | "history"
  | "statuses";

const ITEMS = [
  { id: "overview", label: "Visão geral" },
  { id: "automations", label: "Automações" },
  { id: "templates", label: "Templates de email" },
  { id: "history", label: "Histórico" },
  { id: "statuses", label: "Status CRM" },
] as const;

function Loading() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

export function AdminStudentsWorkspace() {
  const { canAction } = usePermissions();
  const [tab, setTab] = useState<StudentWorkspaceTab>("overview");
  const [visited, setVisited] = useState<Set<StudentWorkspaceTab>>(
    () => new Set(["overview"]),
  );
  const items = useMemo(
    () =>
      ITEMS.filter(
        (item) =>
          item.id === "overview" ||
          (item.id === "automations" &&
            canAction("students.automations.view")) ||
          (item.id === "templates" && canAction("students.templates.manage")) ||
          (item.id === "history" && canAction("students.history.view")) ||
          (item.id === "statuses" && canAction("students.statuses.manage")),
      ),
    [canAction],
  );
  useEffect(() => {
    if (!items.some((item) => item.id === tab)) setTab("overview");
  }, [items, tab]);
  return (
    <div className="space-y-4">
      <Tabs
        items={[...items]}
        value={tab}
        onChange={(value) => {
          const next = value as StudentWorkspaceTab;
          setVisited((current) =>
            current.has(next) ? current : new Set([...current, next]),
          );
          setTab(next);
        }}
        ariaLabel="Subabas de alunos"
        accent="cyan"
      />
      <Suspense fallback={<Loading />}>
        {visited.has("overview") ? (
          <div hidden={tab !== "overview"}>
            <AdminStudentsTab />
          </div>
        ) : null}
        {visited.has("automations") ? (
          <div hidden={tab !== "automations"}>
            <StudentAutomationsTab />
          </div>
        ) : null}
        {visited.has("templates") ? (
          <div hidden={tab !== "templates"}>
            <AutomationEmailTemplatesTab />
          </div>
        ) : null}
        {visited.has("history") ? (
          <div hidden={tab !== "history"}>
            <AutomationHistoryTab />
          </div>
        ) : null}
        {visited.has("statuses") ? (
          <div hidden={tab !== "statuses"}>
            <StudentCrmStatusesTab />
          </div>
        ) : null}
      </Suspense>
    </div>
  );
}
