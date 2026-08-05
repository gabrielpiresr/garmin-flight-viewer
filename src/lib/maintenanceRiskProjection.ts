/**
 * Previsão teórica de parada por manutenção (escala).
 *
 * `currentHours` = horas reais no início de `fromDate` (ex.: valor real de ontem
 * quando `fromDate` é hoje). Cada dia a partir de `fromDate` (inclusive) soma a
 * média diária, exceto dias parados.
 *
 * Regras de risco:
 * - O dia em que a projeção atinge as horas da manutenção = risco médio.
 * - O dia seguinte + os dias parados configurados = risco alto.
 * - O dia após o fim da parada = risco médio.
 * - Dias parados não acumulam horas na previsão teórica.
 * - Sem equipe no domingo: se a parada cair em sábado ou domingo, prolonga +1 dia.
 */

export type MaintenanceRiskLevel = "low" | "medium" | "high";

export type MaintenanceRiskItem = {
  code: string;
  title: string;
  intervalHours: number;
  /** Dias que o avião fica parado; null/0 = item não entra na previsão de risco. */
  downtimeDays: number | null;
};

export type MaintenanceRiskDay = {
  date: string;
  theoreticalHours: number;
  risk: MaintenanceRiskLevel;
  grounded: boolean;
  /** Código da manutenção que motiva o risco neste dia (se houver). */
  maintenanceCode?: string;
  maintenanceTitle?: string;
};

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Sem equipe de manutenção no domingo: se algum dia de parada (após o cruzamento)
 * cair em sábado ou domingo, prolonga a parada em +1 dia.
 *
 * Ex.: bateu no sábado com 1 dia de parada → domingo e segunda parados, terça média.
 */
export function effectiveDowntimeDays(hitDateIso: string, downtimeDays: number): number {
  const base = Math.max(1, Math.round(downtimeDays));
  for (let i = 1; i <= base; i += 1) {
    const weekday = new Date(`${addDaysIso(hitDateIso, i)}T12:00:00`).getDay();
    if (weekday === 0 || weekday === 6) return base + 1;
  }
  return base;
}

function nextDueHours(currentHours: number, intervalHours: number): number {
  if (!(intervalHours > 0)) return Number.POSITIVE_INFINITY;
  return (Math.floor(currentHours / intervalHours) + 1) * intervalHours;
}

function riskRank(level: MaintenanceRiskLevel): number {
  if (level === "high") return 2;
  if (level === "medium") return 1;
  return 0;
}

function mergeRisk(
  current: MaintenanceRiskDay,
  next: Pick<MaintenanceRiskDay, "risk" | "grounded" | "maintenanceCode" | "maintenanceTitle">,
): MaintenanceRiskDay {
  if (riskRank(next.risk) > riskRank(current.risk)) {
    return {
      ...current,
      risk: next.risk,
      grounded: current.grounded || next.grounded,
      maintenanceCode: next.maintenanceCode ?? current.maintenanceCode,
      maintenanceTitle: next.maintenanceTitle ?? current.maintenanceTitle,
    };
  }
  return {
    ...current,
    grounded: current.grounded || next.grounded,
    maintenanceCode: current.maintenanceCode ?? next.maintenanceCode,
    maintenanceTitle: current.maintenanceTitle ?? next.maintenanceTitle,
  };
}

/**
 * Simula a partir de `fromDate` (inclusive).
 * `currentHours` = horas no início desse dia (valor real de “ontem” se fromDate = hoje).
 */
export function projectMaintenanceRisk(params: {
  currentHours: number;
  avgHoursPerDay: number;
  items: MaintenanceRiskItem[];
  fromDate: string;
  /** Quantos dias projetar a partir de fromDate (inclusive). */
  dayCount: number;
}): Record<string, MaintenanceRiskDay> {
  const avg = params.avgHoursPerDay > 0 ? params.avgHoursPerDay : 0;
  const dayCount = Math.max(0, Math.floor(params.dayCount));
  const items = params.items
    .filter((item) => item.intervalHours > 0 && (item.downtimeDays ?? 0) > 0)
    .map((item) => ({
      ...item,
      downtimeDays: Math.max(1, Math.round(item.downtimeDays as number)),
    }))
    .sort((a, b) => b.intervalHours - a.intervalHours);

  const byDate: Record<string, MaintenanceRiskDay> = {};
  let hours = Number.isFinite(params.currentHours) ? params.currentHours : 0;
  let groundedRemaining = 0;
  let activeItem: (typeof items)[number] | null = null;
  let pendingPostMedium: { offset: number; item: (typeof items)[number] } | null = null;

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDaysIso(params.fromDate, offset);
    let day: MaintenanceRiskDay = {
      date,
      theoreticalHours: Number(hours.toFixed(1)),
      risk: "low",
      grounded: false,
    };

    if (pendingPostMedium && pendingPostMedium.offset === offset) {
      day = mergeRisk(day, {
        risk: "medium",
        grounded: false,
        maintenanceCode: pendingPostMedium.item.code,
        maintenanceTitle: pendingPostMedium.item.title,
      });
      pendingPostMedium = null;
    }

    if (groundedRemaining > 0 && activeItem) {
      day = mergeRisk(day, {
        risk: "high",
        grounded: true,
        maintenanceCode: activeItem.code,
        maintenanceTitle: activeItem.title,
      });
      day.theoreticalHours = Number(hours.toFixed(1));
      groundedRemaining -= 1;
      if (groundedRemaining === 0) {
        pendingPostMedium = { offset: offset + 1, item: activeItem };
        activeItem = null;
      }
      byDate[date] = day;
      continue;
    }

    if (avg <= 0) {
      byDate[date] = day;
      continue;
    }

    const hoursBefore = hours;
    hours = Number((hours + avg).toFixed(4));

    const crossed = items
      .map((item) => ({ item, due: nextDueHours(hoursBefore, item.intervalHours) }))
      .filter(({ due }) => hoursBefore < due - 1e-9 && hours + 1e-9 >= due)
      .sort((a, b) => b.item.intervalHours - a.item.intervalHours)[0];

    if (crossed) {
      day = mergeRisk(day, {
        risk: "medium",
        grounded: false,
        maintenanceCode: crossed.item.code,
        maintenanceTitle: crossed.item.title,
      });
      groundedRemaining = effectiveDowntimeDays(date, crossed.item.downtimeDays);
      activeItem = crossed.item;
    }

    day.theoreticalHours = Number(hours.toFixed(1));
    byDate[date] = day;
  }

  return byDate;
}

export function riskLevelLabel(level: MaintenanceRiskLevel): string {
  if (level === "high") return "Probabilidade alta de alteração ou cancelamento do voo por manutenção";
  if (level === "medium") return "Probabilidade relativamente alta de alteração ou cancelamento do voo por manutenção";
  return "Baixa probabilidade de parada por manutenção neste dia";
}

export function worstRisk(levels: MaintenanceRiskLevel[]): MaintenanceRiskLevel {
  return levels.reduce<MaintenanceRiskLevel>(
    (worst, level) => (riskRank(level) > riskRank(worst) ? level : worst),
    "low",
  );
}

export function riskOnDate(
  series: Record<string, MaintenanceRiskDay> | undefined,
  date: string,
): MaintenanceRiskLevel {
  return series?.[date]?.risk ?? "low";
}

export function maintenanceRiskFlagClass(level: MaintenanceRiskLevel): string {
  if (level === "high") return "bg-red-500 text-red-100 border-red-400/60";
  if (level === "medium") return "bg-amber-500 text-amber-950 border-amber-300/60";
  return "bg-emerald-500 text-emerald-950 border-emerald-300/60";
}

export function maintenanceRiskTextClass(level: MaintenanceRiskLevel): string {
  if (level === "high") return "text-red-300 border-red-500/50 bg-red-500/10";
  if (level === "medium") return "text-amber-300 border-amber-500/50 bg-amber-500/10";
  return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
}

/** Estilo da célula teórica no admin: neutro no risco baixo (sem verde). */
export function adminTheoreticalRiskTextClass(level: MaintenanceRiskLevel): string {
  if (level === "high") return "text-red-300 border-red-500/50 bg-red-500/10";
  if (level === "medium") return "text-amber-300 border-amber-500/50 bg-amber-500/10";
  return "border-slate-800/60 bg-slate-950/40 text-slate-400";
}
