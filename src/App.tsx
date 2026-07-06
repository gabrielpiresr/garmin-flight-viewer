import { lazy, Suspense, useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";
import { PermissionsProvider } from "./contexts/PermissionsContext";
import { LoginPage } from "./pages/LoginPage";
import { PendingApprovalScreen } from "./components/PendingApprovalScreen";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { useOnboardingGate } from "./hooks/useOnboardingGate";
import { refreshBrandCache } from "./lib/schoolRulesDb";
import { warmScheduleForUser } from "./lib/scheduleCache";

const MainLayout = lazy(() => import("./components/MainLayout").then((module) => ({ default: module.MainLayout })));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout").then((module) => ({ default: module.AdminLayout })));
const InstructorLayout = lazy(() =>
  import("./components/instructor/InstructorLayout").then((module) => ({ default: module.InstructorLayout })),
);
const OfflineLogbookPage = lazy(() =>
  import("./pages/OfflineLogbookPage").then((module) => ({ default: module.OfflineLogbookPage })),
);
const VideoHelperSetupPage = lazy(() =>
  import("./pages/VideoHelperSetupPage").then((module) => ({ default: module.VideoHelperSetupPage })),
);
const PublicFlightReviewPage = lazy(() =>
  import("./pages/PublicFlightReviewPage").then((module) => ({ default: module.PublicFlightReviewPage })),
);
const FlightReviewClubPage = lazy(() =>
  import("./pages/FlightReviewClubPage").then((module) => ({ default: module.FlightReviewClubPage })),
);
const QualificacaoPage = lazy(() =>
  import("./pages/QualificacaoPage").then((module) => ({ default: module.QualificacaoPage })),
);
const CadastroPage = lazy(() =>
  import("./pages/CadastroPage").then((module) => ({ default: module.CadastroPage })),
);
const PublicProposalPage = lazy(() =>
  import("./pages/PublicProposalPage").then((module) => ({ default: module.PublicProposalPage })),
);
const OnboardingPresentationPage = lazy(() =>
  import("./pages/OnboardingPresentationPage").then((module) => ({ default: module.OnboardingPresentationPage })),
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
  const onboardingGate = useOnboardingGate();
  const isOfflineLogbookRoute = window.location.pathname === "/offline/diario-bordo";
  const isVideoHelperRoute = window.location.pathname === "/video-helper";
  const isPublicFlightReviewRoute = window.location.pathname.startsWith("/share/flight-review/");
  const isFlightReviewClubRoute = window.location.pathname === "/flight-review-club";
  const isQualificacaoRoute = window.location.pathname === "/qualificacao";
  const isCadastroRoute = window.location.pathname === "/cadastro";
  const isProposalRoute = window.location.pathname.startsWith("/proposta/");
  const isApresentacaoRoute = window.location.pathname === "/apresentacao";

  // After login, refresh brand cache and reapply theme with latest settings.
  // Também pré-carrega a aba Escala em segundo plano (ocioso), para que ao abri-la
  // ela já esteja pronta — best-effort, sem competir com o primeiro paint da Home.
  useEffect(() => {
    if (!user) return;
    void refreshBrandCache();
    const warm = () => void warmScheduleForUser(user);
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const usedIdle = typeof w.requestIdleCallback === "function";
    const handle = usedIdle ? w.requestIdleCallback!(warm, { timeout: 3000 }) : window.setTimeout(warm, 1200);
    return () => {
      if (usedIdle) w.cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
    };
  }, [user?.id]);

  if (isOfflineLogbookRoute) {
    return (
      <Suspense fallback={<AppLoading />}>
        <OfflineLogbookPage />
      </Suspense>
    );
  }

  if (isVideoHelperRoute) {
    return (
      <Suspense fallback={<AppLoading />}>
        <VideoHelperSetupPage />
      </Suspense>
    );
  }

  if (isPublicFlightReviewRoute) {
    return (
      <Suspense fallback={<AppLoading />}>
        <PublicFlightReviewPage />
      </Suspense>
    );
  }

  if (isFlightReviewClubRoute) {
    return (
      <Suspense fallback={<AppLoading />}>
        <FlightReviewClubPage />
      </Suspense>
    );
  }

  if (isQualificacaoRoute) {
    return (
      <Suspense fallback={<AppLoading />}>
        <QualificacaoPage />
      </Suspense>
    );
  }

  if (isCadastroRoute) {
    return (
      <Suspense fallback={<AppLoading />}>
        <CadastroPage />
      </Suspense>
    );
  }

  if (isProposalRoute) {
    return (
      <Suspense fallback={<AppLoading />}>
        <PublicProposalPage />
      </Suspense>
    );
  }

  if (loading) {
    return <AppLoading />;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (isApresentacaoRoute) {
    return (
      <PermissionsProvider>
        <Suspense fallback={<AppLoading />}>
          <OnboardingPresentationPage />
        </Suspense>
      </PermissionsProvider>
    );
  }

  if (user.role === "admin") {
    return (
      <PermissionsProvider>
        <Suspense fallback={<AppLoading />}>
          <AdminLayout />
        </Suspense>
      </PermissionsProvider>
    );
  }

  if (user.role === "instrutor") {
    return (
      <PermissionsProvider>
        <Suspense fallback={<AppLoading />}>
          <InstructorLayout />
        </Suspense>
      </PermissionsProvider>
    );
  }

  if (user.approvalStatus === "pending") {
    return <PendingApprovalScreen />;
  }

  if (user.role === "aluno" && onboardingGate.loading) {
    return <AppLoading />;
  }

  if (user.role === "aluno" && onboardingGate.shouldShow) {
    return (
      <OnboardingFlow
        steps={onboardingGate.steps}
        onComplete={onboardingGate.complete}
      />
    );
  }

  return (
    <PermissionsProvider>
      <Suspense fallback={<AppLoading />}>
        <MainLayout />
      </Suspense>
    </PermissionsProvider>
  );
}
