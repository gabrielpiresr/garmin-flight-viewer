import { lazy, Suspense, useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { refreshBrandCache } from "./lib/schoolRulesDb";

const MainLayout = lazy(() => import("./components/MainLayout").then((module) => ({ default: module.MainLayout })));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout").then((module) => ({ default: module.AdminLayout })));
const InstructorLayout = lazy(() =>
  import("./components/instructor/InstructorLayout").then((module) => ({ default: module.InstructorLayout })),
);
const OfflineLogbookPage = lazy(() =>
  import("./pages/OfflineLogbookPage").then((module) => ({ default: module.OfflineLogbookPage })),
);

function AppLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const isOfflineLogbookRoute = window.location.pathname === "/offline/diario-bordo";

  // After login, refresh brand cache and reapply theme with latest settings.
  useEffect(() => {
    if (user) void refreshBrandCache();
  }, [user?.id]);

  if (isOfflineLogbookRoute) {
    return (
      <Suspense fallback={<AppLoading />}>
        <OfflineLogbookPage />
      </Suspense>
    );
  }

  if (loading) {
    return <AppLoading />;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (user.role === "admin") {
    return (
      <Suspense fallback={<AppLoading />}>
        <AdminLayout />
      </Suspense>
    );
  }

  if (user.role === "instrutor") {
    return (
      <Suspense fallback={<AppLoading />}>
        <InstructorLayout />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<AppLoading />}>
      <MainLayout />
    </Suspense>
  );
}
