import { useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";
import { MainLayout } from "./components/MainLayout";
import { AdminLayout } from "./components/admin/AdminLayout";
import { InstructorLayout } from "./components/instructor/InstructorLayout";
import { LoginPage } from "./pages/LoginPage";
import { refreshBrandCache } from "./lib/schoolRulesDb";

export default function App() {
  const { user, loading } = useAuth();

  // After login, refresh brand cache and reapply theme with latest settings.
  useEffect(() => {
    if (user) void refreshBrandCache();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (user.role === "admin") {
    return <AdminLayout />;
  }

  if (user.role === "instrutor") {
    return <InstructorLayout />;
  }

  return <MainLayout />;
}
