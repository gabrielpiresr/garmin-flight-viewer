import { lazy, Suspense } from "react";
import { useAuth } from "../contexts/AuthContext";

const ScheduleFlightsTab = lazy(() =>
  import("../components/admin/ScheduleFlightsTab").then((module) => ({ default: module.ScheduleFlightsTab })),
);

function PublicScheduleLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

function PublicScheduleAccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center">
      <div className="max-w-md space-y-2">
        <p className="text-base font-semibold text-slate-200">Acesso restrito</p>
        <p className="text-sm text-slate-400">
          A escala pública está disponível apenas para administradores e instrutores.
        </p>
      </div>
    </div>
  );
}

export function PublicSchedulePage() {
  const { user, loading } = useAuth();

  if (loading) return <PublicScheduleLoading />;
  if (!user || (user.role !== "admin" && user.role !== "instrutor")) {
    return <PublicScheduleAccessDenied />;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto w-full max-w-[1920px] p-3 sm:p-4">
        <Suspense fallback={<PublicScheduleLoading />}>
          <ScheduleFlightsTab publicDisplayMode />
        </Suspense>
      </div>
    </div>
  );
}
