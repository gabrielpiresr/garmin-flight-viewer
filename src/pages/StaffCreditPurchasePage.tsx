import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { FlightCreditSalesConfig } from "../types/flightCreditSales";
import type { StaffCreditPurchaseStudent } from "../lib/staffCreditPurchaseDb";
import {
  getStaffFlightCreditPackagesForStudent,
  searchStaffCreditPurchaseStudents,
  staffCreateFlightCreditCheckout,
} from "../lib/staffCreditPurchaseDb";
import { getStudentCreditStatement } from "../lib/creditsDb";
import { renderCheckoutLoading } from "../lib/flightCreditPurchase";
import { CreditTotalsHeader } from "../components/CreditTotalsHeader";
import { FlightCreditPurchasePanel } from "../components/FlightCreditPurchasePanel";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/ToastProvider";

const MIN_SEARCH_LENGTH = 3;

export function StaffCreditPurchasePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StaffCreditPurchaseStudent[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StaffCreditPurchaseStudent | null>(null);
  const [config, setConfig] = useState<FlightCreditSalesConfig | null>(null);
  const [balanceHours, setBalanceHours] = useState<number | null>(null);
  const [purchasedHours, setPurchasedHours] = useState<number | null>(null);
  const [consumedHours, setConsumedHours] = useState<number | null>(null);
  const [expiredHours, setExpiredHours] = useState<number | null>(null);
  const [studentDataLoading, setStudentDataLoading] = useState(false);
  const [studentDataError, setStudentDataError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const searchStudents = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await searchStaffCreditPurchaseStudents(trimmed);
      setSearchResults(results);
    } catch (error) {
      setSearchError((error as Error).message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStudent) return;
    const timer = window.setTimeout(() => void searchStudents(search), 300);
    return () => window.clearTimeout(timer);
  }, [search, selectedStudent, searchStudents]);

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

  function selectStudent(student: StaffCreditPurchaseStudent) {
    setSelectedStudent(student);
    setSearch("");
    setSearchResults([]);
    setSearchError(null);
  }

  function clearSelectedStudent() {
    setSelectedStudent(null);
    setSearch("");
    setSearchResults([]);
    setConfig(null);
    setBalanceHours(null);
    setPurchasedHours(null);
    setConsumedHours(null);
    setExpiredHours(null);
    setStudentDataError(null);
  }

  async function startCheckout(packageId: string, customHours?: number, weekdayOnly?: boolean) {
    if (!selectedStudent || checkoutBusy) return;
    const checkoutWindow = window.open("about:blank", "_blank");
    if (checkoutWindow) {
      renderCheckoutLoading(checkoutWindow);
      checkoutWindow.opener = null;
    }
    setCheckoutBusy(true);
    try {
      const checkout = await staffCreateFlightCreditCheckout(
        selectedStudent.userId,
        packageId,
        customHours,
        weekdayOnly,
      );
      if (checkoutWindow) {
        checkoutWindow.location.href = checkout.paymentUrl;
      } else {
        window.open(checkout.paymentUrl, "_blank", "noopener,noreferrer");
      }
      showToast({ variant: "success", message: "Checkout criado. Conclua o pagamento na nova aba." });
    } catch (error) {
      checkoutWindow?.close();
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
      <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">Adicionar créditos</h1>

        <section className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">Aluno</span>
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {selectedStudent.name || selectedStudent.email}
                  </p>
                  {selectedStudent.name && selectedStudent.email ? (
                    <p className="text-xs text-slate-500">{selectedStudent.email}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={clearSelectedStudent}
                  className="text-xs text-slate-500 transition hover:text-slate-300"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar aluno por nome ou e-mail (mín. 3 caracteres)…"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                />
                {search.trim().length > 0 && search.trim().length < MIN_SEARCH_LENGTH ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Digite pelo menos {MIN_SEARCH_LENGTH} caracteres para buscar.
                  </p>
                ) : null}
                {searchError ? <p className="mt-2 text-sm text-red-300">{searchError}</p> : null}
                {searchLoading ? (
                  <p className="mt-2 text-xs text-slate-500">Buscando…</p>
                ) : null}
                {!searchLoading && search.trim().length >= MIN_SEARCH_LENGTH && searchResults.length > 0 ? (
                  <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900">
                    {searchResults.map((student) => (
                      <li key={student.userId}>
                        <button
                          type="button"
                          onClick={() => selectStudent(student)}
                          className="w-full px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-slate-800"
                        >
                          <span className="font-medium">{student.name || student.email}</span>
                          {student.name && student.email ? (
                            <span className="ml-1 text-slate-500">{student.email}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!searchLoading &&
                search.trim().length >= MIN_SEARCH_LENGTH &&
                searchResults.length === 0 &&
                !searchError ? (
                  <p className="mt-2 text-xs text-slate-500">Nenhum aluno encontrado.</p>
                ) : null}
              </>
            )}
          </label>
        </section>

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
    </div>
  );
}
