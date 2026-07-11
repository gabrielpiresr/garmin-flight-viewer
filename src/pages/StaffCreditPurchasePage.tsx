import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { FlightCreditSalesConfig } from "../types/flightCreditSales";
import type { StaffCreditPurchaseStudent } from "../lib/staffCreditPurchaseDb";
import {
  getStaffFlightCreditPackagesForStudent,
  staffCreateFlightCreditCheckout,
} from "../lib/staffCreditPurchaseDb";
import { getStudentCreditStatement } from "../lib/creditsDb";
import { CreditTotalsHeader } from "../components/CreditTotalsHeader";
import { FlightCreditPurchasePanel } from "../components/FlightCreditPurchasePanel";
import { StaffCheckoutModal } from "../components/StaffCheckoutModal";
import { StaffStudentSelector } from "../components/StaffStudentSelector";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/ToastProvider";

const StudentScheduleTab = lazy(() =>
  import("../components/StudentScheduleTab").then((module) => ({ default: module.StudentScheduleTab })),
);

type TabletTab = "creditos" | "escala";

export function StaffCreditPurchasePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabletTab>("creditos");
  const [selectedStudent, setSelectedStudent] = useState<StaffCreditPurchaseStudent | null>(null);
  const [config, setConfig] = useState<FlightCreditSalesConfig | null>(null);
  const [balanceHours, setBalanceHours] = useState<number | null>(null);
  const [purchasedHours, setPurchasedHours] = useState<number | null>(null);
  const [consumedHours, setConsumedHours] = useState<number | null>(null);
  const [expiredHours, setExpiredHours] = useState<number | null>(null);
  const [studentDataLoading, setStudentDataLoading] = useState(false);
  const [studentDataError, setStudentDataError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutSession, setCheckoutSession] = useState<{ paymentUrl: string } | null>(null);

  useEffect(() => {
    const selectedUserId = selectedStudent?.userId ?? "";
    if (!selectedUserId || !user) {
      setConfig(null);
      setBalanceHours(null);
      setPurchasedHours(null);
      setConsumedHours(null);
      setExpiredHours(null);
      setStudentDataError(null);
      return;
    }
    let cancelled = false;
    setStudentDataLoading(true);
    setStudentDataError(null);
    void Promise.all([
      getStaffFlightCreditPackagesForStudent(selectedUserId),
      getStudentCreditStatement({
        viewer: { userId: user.id, role: user.role },
        studentUserId: selectedUserId,
      }),
    ])
      .then(([nextConfig, statement]) => {
        if (cancelled) return;
        setBalanceHours(statement.totals.balanceHours);
        setPurchasedHours(statement.totals.purchasedHours);
        setConsumedHours(statement.totals.consumedHours);
        setExpiredHours(statement.totals.expiredHours);
        if (!nextConfig.studentPurchasesEnabled || nextConfig.packages.length === 0) {
          setStudentDataError("Não há pacotes disponíveis para compra para este aluno.");
          setConfig(null);
          return;
        }
        setConfig(nextConfig);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setStudentDataError(error.message);
        setConfig(null);
        setBalanceHours(null);
        setPurchasedHours(null);
        setConsumedHours(null);
        setExpiredHours(null);
      })
      .finally(() => {
        if (!cancelled) setStudentDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStudent, user]);

  function clearSelectedStudent() {
    setSelectedStudent(null);
    setConfig(null);
    setBalanceHours(null);
    setPurchasedHours(null);
    setConsumedHours(null);
    setExpiredHours(null);
    setStudentDataError(null);
  }

  async function startCheckout(packageId: string, customHours?: number, weekdayOnly?: boolean) {
    if (!selectedStudent || checkoutBusy) return;
    setCheckoutBusy(true);
    try {
      const checkout = await staffCreateFlightCreditCheckout(
        selectedStudent.userId,
        packageId,
        customHours,
        weekdayOnly,
      );
      setCheckoutSession({ paymentUrl: checkout.paymentUrl });
      showToast({ variant: "success", message: "Checkout criado." });
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setCheckoutBusy(false);
    }
  }

  const studentLabel = selectedStudent
    ? selectedStudent.name
      ? `${selectedStudent.name}${selectedStudent.email ? ` · ${selectedStudent.email}` : ""}`
      : selectedStudent.email
    : undefined;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] [&_.text-\[10px\]]:text-xs [&_.text-\[11px\]]:text-sm [&_.text-xs]:text-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">Tablet da escola</h1>
          <p className="text-sm text-slate-500">
            Auxilie alunos com pagamentos e agendamento de voos.
          </p>
        </div>

        <div className="flex overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/30 p-1">
          {([
            ["creditos", "Créditos"],
            ["escala", "Escala"],
          ] as const).map(([tabId, label]) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId)}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                activeTab === tabId
                  ? "bg-emerald-600/20 text-emerald-300"
                  : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <StaffStudentSelector
          selectedStudent={selectedStudent}
          onSelectStudent={setSelectedStudent}
          onClearStudent={clearSelectedStudent}
        />

        {activeTab === "creditos" ? (
          <div className="mx-auto w-full max-w-xl">
            {!selectedStudent ? null : studentDataLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 rounded-xl" />
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 rounded-xl" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {balanceHours != null && purchasedHours != null && consumedHours != null && expiredHours != null ? (
                  <CreditTotalsHeader
                    balanceHours={balanceHours}
                    purchasedHours={purchasedHours}
                    consumedHours={consumedHours}
                    expiredHours={expiredHours}
                    studentLabel={studentLabel}
                  />
                ) : null}
                {studentDataError || !config ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-300">
                    {studentDataError ?? "Pacotes indisponíveis."}
                  </div>
                ) : (
                  <FlightCreditPurchasePanel
                    config={config}
                    onCheckout={startCheckout}
                    checkoutBusy={checkoutBusy}
                  />
                )}
              </>
            )}
          </div>
        ) : !selectedStudent ? (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-6 text-center text-sm text-slate-500">
            Selecione um aluno para visualizar e agendar voos na escala.
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-96 w-full rounded-xl" />
              </div>
            }
          >
            <StudentScheduleTab
              key={selectedStudent.userId}
              actingForStudent={{
                userId: selectedStudent.userId,
                name: selectedStudent.name,
                email: selectedStudent.email,
              }}
              onStaffCreditsCta={() => setActiveTab("creditos")}
            />
          </Suspense>
        )}
      </div>

      {checkoutSession ? (
        <StaffCheckoutModal
          paymentUrl={checkoutSession.paymentUrl}
          studentLabel={studentLabel}
          onClose={() => setCheckoutSession(null)}
        />
      ) : null}
    </div>
  );
}
