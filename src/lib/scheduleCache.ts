// Cache compartilhado (nível de módulo) para os dados de escala.
//
// Motivação: Home admin e Escala (admin/instrutor/aluno) buscavam os mesmos dados
// pesados (horas-base da frota, 3 meses de eventos SAGA, semana de escala) cada uma no
// seu próprio ref local, que era descartado ao desmontar a aba. Centralizando aqui:
//   1. Home e Escala compartilham as horas-base (montar uma aquece a outra);
//   2. os dados sobrevivem à troca de aba;
//   3. um prefetch pós-login (warmScheduleForUser) pode aquecer tudo em segundo plano,
//      de modo que ao clicar na aba Escala ela já esteja pronta.
//
// Cada cache tem TTL + dedupe de chamadas em andamento (mesmo padrão dos refs originais).

import { DEFAULT_SCHOOL_ID } from "./appwrite";
import { getPublicSchedule } from "./scheduleBookingDb";
import { listSagaSchedulesDirect, type SagaDirectScheduleItem } from "./sagaImportDb";
import {
  loadFleetMaintenanceContext,
  type FleetMaintenanceContext,
} from "./aircraftHoursProjection";
import {
  generateScheduleWeekPickerOptions,
  getScheduleWeekData,
  pickDefaultScheduleWeek,
} from "./scheduleGenerationDb";
import { getSchoolRules } from "./schoolRulesDb";
import type { ScheduleWeekData, ScheduleWeekOption } from "../types/schedule";
import type { UserRole } from "./rbac";

const DEFAULT_TTL_MS = 60_000;

type CacheEntry<T> = { at: number; value: T };
type CacheOptions = { ttlMs?: number; force?: boolean };

/** TTL + dedupe genérico para uma função assíncrona chaveada por string. */
function cachedCall<T>(
  store: Map<string, CacheEntry<T>>,
  inflight: Map<string, Promise<T>>,
  key: string,
  loader: () => Promise<T>,
  opts?: CacheOptions,
): Promise<T> {
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const cached = store.get(key);
  if (!opts?.force && cached && Date.now() - cached.at < ttl) return Promise.resolve(cached.value);
  if (!opts?.force) {
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const promise = loader()
    .then((value) => {
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

// ─── Escala pública (aluno/instrutor via getCalendar) ────────────────────────────

export type PublicScheduleResult = Awaited<ReturnType<typeof getPublicSchedule>>;

const publicScheduleStore = new Map<string, CacheEntry<PublicScheduleResult>>();
const publicScheduleInflight = new Map<string, Promise<PublicScheduleResult>>();

export function getPublicScheduleCached(
  dateFrom: string,
  dateTo: string,
  opts?: CacheOptions & { forStudentUserId?: string },
): Promise<PublicScheduleResult> {
  const studentKey = opts?.forStudentUserId ? `|student:${opts.forStudentUserId}` : "";
  return cachedCall(
    publicScheduleStore,
    publicScheduleInflight,
    `${dateFrom}|${dateTo}${studentKey}`,
    () => getPublicSchedule(dateFrom, dateTo, { forStudentUserId: opts?.forStudentUserId }),
    opts,
  );
}

/** Chamada após mutações do aluno (solicitar/alterar/cancelar) para forçar dados frescos. */
export function invalidatePublicSchedule(): void {
  publicScheduleStore.clear();
  publicScheduleInflight.clear();
}

// ─── Eventos SAGA (3 meses numa chamada, modo escala somente no SAGA) ─────────────

const sagaEventsStore = new Map<string, CacheEntry<SagaDirectScheduleItem[]>>();
const sagaEventsInflight = new Map<string, Promise<SagaDirectScheduleItem[]>>();

export function getSagaScheduleEventsCached(
  monthCount = 3,
  opts?: CacheOptions,
): Promise<SagaDirectScheduleItem[]> {
  return cachedCall(
    sagaEventsStore,
    sagaEventsInflight,
    String(monthCount),
    () => listSagaSchedulesDirect(monthCount),
    opts,
  );
}

/** Leitura síncrona do cache SAGA (fast-path da projeção de horas), ou null se ausente/vencido. */
export function peekSagaScheduleEvents(monthCount = 3, ttlMs = DEFAULT_TTL_MS): SagaDirectScheduleItem[] | null {
  const cached = sagaEventsStore.get(String(monthCount));
  if (!cached || Date.now() - cached.at >= ttlMs) return null;
  return cached.value;
}

export function invalidateSagaScheduleEvents(): void {
  sagaEventsStore.clear();
  sagaEventsInflight.clear();
}

// ─── Contexto de frota + manutenção (compartilhado por Home e Escala) ─────────────

const fleetContextStore = new Map<string, CacheEntry<FleetMaintenanceContext>>();
const fleetContextInflight = new Map<string, Promise<FleetMaintenanceContext>>();

export function loadFleetMaintenanceContextCached(
  schoolId: string,
  opts?: CacheOptions,
): Promise<FleetMaintenanceContext> {
  return cachedCall(
    fleetContextStore,
    fleetContextInflight,
    schoolId,
    () => loadFleetMaintenanceContext(schoolId),
    opts,
  );
}

export function invalidateFleetMaintenanceContext(): void {
  fleetContextStore.clear();
  fleetContextInflight.clear();
}

// ─── Semana de escala do admin/instrutor (getScheduleWeekData) ────────────────────

type ScheduleWeekDataParams = {
  weekStart: string;
  actorUserId: string;
  actorRole: UserRole;
  scope?: "full" | "flights-only";
  week?: ScheduleWeekOption;
};

const weekDataStore = new Map<string, CacheEntry<ScheduleWeekData>>();
const weekDataInflight = new Map<string, Promise<ScheduleWeekData>>();

export function getScheduleWeekDataCached(
  params: ScheduleWeekDataParams,
  opts?: CacheOptions,
): Promise<ScheduleWeekData> {
  const scope = params.scope ?? "full";
  const key = `${params.actorUserId}|${params.actorRole}|${scope}|${params.weekStart}`;
  return cachedCall(
    weekDataStore,
    weekDataInflight,
    key,
    () => getScheduleWeekData({ ...params, scope }),
    opts,
  );
}

export function invalidateScheduleWeekData(): void {
  weekDataStore.clear();
  weekDataInflight.clear();
}

// ─── Warm pós-login ───────────────────────────────────────────────────────────────

/** Segunda-feira da semana atual (mesma normalização local usada no StudentScheduleTab). */
function studentCurrentWeekBounds(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  now.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const end = new Date(`${from}T12:00:00`);
  end.setDate(end.getDate() + 6);
  const to = end.toISOString().slice(0, 10);
  return { from, to };
}

type WarmUser = {
  id: string;
  role: UserRole;
  schoolId?: string | null;
  approvalStatus?: string | null;
};

/**
 * Aquece, em segundo plano, os dados da aba Escala do usuário logado.
 * Best-effort: qualquer falha é ignorada (a aba busca normalmente ao abrir).
 */
export async function warmScheduleForUser(user: WarmUser): Promise<void> {
  if (!user?.id || user.approvalStatus === "pending") return;

  if (user.role === "aluno") {
    const { from, to } = studentCurrentWeekBounds();
    await getPublicScheduleCached(from, to).catch(() => undefined);
    return;
  }

  // admin / instrutor: mesma tela de escala (ScheduleFlightsTab).
  const schoolId = user.schoolId || DEFAULT_SCHOOL_ID;
  const weeks = generateScheduleWeekPickerOptions();
  const defaultWeek = pickDefaultScheduleWeek(weeks);

  await Promise.all([
    loadFleetMaintenanceContextCached(schoolId).catch(() => undefined),
    defaultWeek
      ? getScheduleWeekDataCached({
          weekStart: defaultWeek.weekStart,
          actorUserId: user.id,
          actorRole: user.role,
          scope: "flights-only",
          week: defaultWeek,
        }).catch(() => undefined)
      : Promise.resolve(),
    // Só aquece o SAGA quando a escola opera em modo "somente SAGA".
    getSchoolRules()
      .then((rules) => {
        if (rules?.schedule?.sagaOnlySchedule) return getSagaScheduleEventsCached(3);
        return undefined;
      })
      .catch(() => undefined),
  ]);
}
