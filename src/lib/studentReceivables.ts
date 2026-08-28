import type { AdminUserSummary } from "../types/adminUsers";
import type { FlightCreditPackage } from "../types/flightCreditSales";
import type { UserRole } from "./rbac";
import { getStudentCreditStatement } from "./creditsDb";
import { getAdminFlightCreditPackagesForStudent } from "./flightCreditSalesDb";

export type StudentDebtCharge = {
  student: AdminUserSummary;
  debtHours: number;
  amount: number;
  hourPrice: number;
  packageId: string;
  packageName: string;
  lastFlightAt: string | null;
  balanceHours: number;
};

export function pickPackageForDebtHours(packages: FlightCreditPackage[], debtHours: number): FlightCreditPackage | null {
  const sorted = packages
    .filter((item) => item.active && item.hours > 0 && item.hourPrice > 0)
    .sort((a, b) => a.hours - b.hours);
  if (!sorted.length) return null;
  if (!Number.isFinite(debtHours) || debtHours <= 0) return sorted[0];
  return [...sorted].reverse().find((item) => item.hours <= debtHours) ?? sorted[0];
}

export async function getStudentDebtCharge(params: {
  viewer: { userId: string; role: UserRole };
  student: AdminUserSummary;
}): Promise<StudentDebtCharge | null> {
  const config = await getAdminFlightCreditPackagesForStudent(params.student.userId);
  const statement = await getStudentCreditStatement({
    viewer: params.viewer,
    studentUserId: params.student.userId,
    nightHoursDifferentFromDay: config.nightHoursDifferentFromDay,
  });
  const debtHours = Number(Math.max(
    0,
    Number(statement.totals.debtHours ?? 0),
    Number(statement.totals.unallocatedFlightHours ?? 0),
    -Number(statement.totals.balanceHours ?? 0),
  ).toFixed(1));
  if (debtHours <= 0) return null;

  const referencePackage = pickPackageForDebtHours(config.packages, debtHours);
  if (!referencePackage) {
    return {
      student: params.student,
      debtHours,
      amount: 0,
      hourPrice: 0,
      packageId: "",
      packageName: "Pacote indisponivel",
      lastFlightAt: params.student.executed.lastFlightAt,
      balanceHours: statement.totals.balanceHours,
    };
  }

  const amount = Math.round(debtHours * referencePackage.hourPrice * 100) / 100;
  return {
    student: params.student,
    debtHours,
    amount,
    hourPrice: referencePackage.hourPrice,
    packageId: referencePackage.id,
    packageName: `${referencePackage.hours}h - ${referencePackage.aircraftModelName || "Modelo nao informado"}`,
    lastFlightAt: params.student.executed.lastFlightAt,
    balanceHours: statement.totals.balanceHours,
  };
}
