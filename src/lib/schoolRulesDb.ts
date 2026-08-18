import { Query } from "appwrite";
import { ADMIN_USERS_FUNCTION_ID, BUCKET_ID, databases, functions, ID, NOTICES_BUCKET_ID, Permission, PLATFORM_SETTINGS_COL_ID, Role, storage } from "./appwrite";
import { getEmailBrandSettings } from "./notificationsDb";
import {
  DEFAULT_FLIGHT_REVIEW_CLUB_RULES,
  DEFAULT_LP_SECTIONS,
  DEFAULT_SCHOOL_RULES,
  ensureLpBenefitCoverage,
  ensureLpScreenshotCoverage,
  normalizeFlightReviewClubTrainingCourses,
  normalizeSchoolRules,
  type FlightReviewClubRules,
  type FlightReviewClubTrainingCourse,
  type SchoolRules,
  type SchoolRulesInput,
} from "../types/schoolRules";

const RULES_CACHE_KEY = "gfv:schoolRules";
const FRC_LP_CACHE_KEY = "gfv:frcLpSnapshot";
const FRC_TRAINING_CACHE_KEY = "gfv:frcTrainingSnapshot";
const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const SCHOOL_RULES_SETTING_KEY = "schoolRules";
const FRC_LP_SETTING_KEY = "frcLandingPage";
const FRC_LP_SNAPSHOT_ID = "frc-landing-v1";
const FRC_TRAINING_SNAPSHOT_ID = "frc-training-v1";
const APPWRITE_STRING_ATTR_MAX = 16_384;

function cacheSchoolRules(rules: SchoolRules): void {
  try {
    window.localStorage.setItem(RULES_CACHE_KEY, JSON.stringify(rules));
  } catch {
    // best effort
  }
}

export function getCachedSchoolRules(): SchoolRules | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(RULES_CACHE_KEY) : null;
    return raw ? normalizeSchoolRules(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function injectGoogleFont(fontFamily: string): void {
  const id = "google-font-dynamic";
  const existing = document.getElementById(id) as HTMLLinkElement | null;
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@300;400;500;600;700&display=swap`;
  if (existing) {
    if (existing.href !== href) existing.href = href;
    return;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function setFavicon(url: string): void {
  const id = "dynamic-favicon";
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

export type BrandApplyOptions = {
  schoolName?: string | null;
  faviconUrl?: string | null;
};

type SchoolRulesResponse = {
  ok?: boolean;
  message?: string;
  schoolRules?: SchoolRules;
};

function parseResponse(body: string | undefined): SchoolRulesResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as SchoolRulesResponse;
  } catch {
    return {};
  }
}

async function executeSchoolRules(payload: Record<string, unknown>): Promise<SchoolRulesResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }

  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar função de regras.");
  }
  return response;
}

export async function getSchoolRules(): Promise<SchoolRules> {
  const response = await executeSchoolRules({ action: "getSchoolRules" });
  let rules = normalizeSchoolRules(response.schoolRules ?? DEFAULT_SCHOOL_RULES);
  const [direct, landingDoc, snapshot, localSnapshot, trainingSnapshot, localTrainingSnapshot] = await Promise.all([
    getSchoolRulesDirectFallback().catch(() => null),
    getFrcLandingSettings().catch(() => null),
    getFrcLandingSnapshot().catch(() => null),
    Promise.resolve(readLocalLpSnapshot()),
    getFrcTrainingSnapshot().catch(() => null),
    Promise.resolve(readLocalTrainingSnapshot()),
  ]);
  if (direct && !hasScheduleField(response.schoolRules, "maxBookingLeadDaysFrc")) {
    rules = {
      ...direct,
      flightReviewClub: overlayFrcLpContent(direct.flightReviewClub, rules.flightReviewClub),
    };
  }
  if (direct) {
    rules = {
      ...rules,
      flightReviewClub: overlayFrcLpContent(rules.flightReviewClub, direct.flightReviewClub),
    };
  }
  if (snapshot) {
    rules = {
      ...rules,
      flightReviewClub: overlayFrcLpContent(rules.flightReviewClub, snapshot),
    };
  }
  if (localSnapshot) {
    rules = {
      ...rules,
      flightReviewClub: overlayFrcLpContent(rules.flightReviewClub, localSnapshot, true),
    };
  }
  if (landingDoc) {
    rules = {
      ...rules,
      flightReviewClub: overlayFrcLpContent(rules.flightReviewClub, landingDoc, true),
    };
  }
  if (trainingSnapshot) {
    rules = {
      ...rules,
      flightReviewClub: overlayFrcLpContent(rules.flightReviewClub, { trainingCourses: trainingSnapshot }, true),
    };
  } else if (localTrainingSnapshot) {
    rules = {
      ...rules,
      flightReviewClub: overlayFrcLpContent(rules.flightReviewClub, { trainingCourses: localTrainingSnapshot }, true),
    };
  }
  if (!snapshot && lpHasCustomMedia(rules.flightReviewClub)) {
    void saveFrcLandingSnapshot(rules.flightReviewClub).catch(() => undefined);
  }
  cacheSchoolRules(rules);
  return rules;
}

export async function saveSchoolRules(rules: SchoolRulesInput): Promise<SchoolRules> {
  const intended = normalizeSchoolRules({ ...rules, updatedAt: null });
  await saveFrcLandingSettings(intended.flightReviewClub);
  await saveFrcTrainingSnapshot(intended.flightReviewClub.trainingCourses);
  void saveFrcLandingSnapshot(intended.flightReviewClub).catch(() => undefined);
  const compactRules = schoolRulesWithoutFrcTraining(rules);
  const response = await executeSchoolRules({ action: "saveSchoolRules", rules: compactRules });
  if (!response.schoolRules) throw new Error(response.message || "Regras da escola não retornadas.");
  const fromFn = normalizeSchoolRules(response.schoolRules);
  let saved = fromFn;
  try {
    saved = await saveSchoolRulesDirectFallback(compactRules);
  } catch {
    saved = fromFn;
  }
  saved = {
    ...saved,
    flightReviewClub: overlayFrcLpContent(saved.flightReviewClub, intended.flightReviewClub, true),
  };
  cacheSchoolRules(saved);
  applySchoolTheme(saved);
  return saved;
}

async function saveSchoolRulesDirectFallback(rules: SchoolRulesInput): Promise<SchoolRules> {
  if (!databases || !DB_ID || !PLATFORM_SETTINGS_COL_ID) {
    throw new Error("A função administrativa não salvou a antecedência FRC e o fallback direto não está configurado.");
  }
  const normalized = normalizeSchoolRules({ ...rules, updatedAt: null });
  const { updatedAt: _updatedAt, ...settings } = {
    ...normalized,
    flightReviewClub: {
      ...normalized.flightReviewClub,
      lpCoverImageUrl: "",
      lpBenefitItems: normalized.flightReviewClub.lpBenefitItems.map((item) => ({ ...item, imageUrl: "" })),
      lpScreenshotItems: normalized.flightReviewClub.lpScreenshotItems.map((item) => ({ ...item, imageUrl: "" })),
    },
  };
  const current = await getSchoolRulesSettingsDoc();
  if (!current) {
    throw new Error("Documento de regras da escola não encontrado para aplicar fallback.");
  }
  const settingsJson = JSON.stringify(settings);
  if (settingsJson.length > APPWRITE_STRING_ATTR_MAX) {
    throw new Error("Payload de regras excede o limite do Appwrite; mantendo retorno da função administrativa.");
  }
  const doc = await databases.updateDocument(DB_ID, PLATFORM_SETTINGS_COL_ID, current.$id, {
    key: SCHOOL_RULES_SETTING_KEY,
    settings_json: settingsJson,
  });
  return normalizeSchoolRules({
    ...settings,
    flightReviewClub: normalized.flightReviewClub,
    updatedAt: doc.$updatedAt ?? null,
  });
}

function hasScheduleField(rules: SchoolRules | undefined, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(rules?.schedule ?? {}, key);
}

function schoolRulesWithoutFrcTraining(rules: SchoolRulesInput): SchoolRulesInput {
  const normalized = normalizeSchoolRules({ ...rules, updatedAt: null });
  return {
    ...normalized,
    flightReviewClub: {
      ...normalized.flightReviewClub,
      lpCoverImageUrl: "",
      lpBenefitItems: normalized.flightReviewClub.lpBenefitItems.map((item) => ({ ...item, imageUrl: "" })),
      lpScreenshotItems: normalized.flightReviewClub.lpScreenshotItems.map((item) => ({ ...item, imageUrl: "" })),
      trainingCourses: [],
    },
  };
}

function lpHasCustomMedia(club: Partial<FlightReviewClubRules> | null | undefined): boolean {
  if (!club) return false;
  if (club.lpCoverImageUrl) return true;
  if ((club.lpScreenshotItems ?? []).some((item) => item.imageUrl)) return true;
  if ((club.lpBenefitItems ?? []).some((item) => item.imageUrl)) return true;
  return false;
}

function looksLikeDefaultChips(chips: string[] | undefined): boolean {
  return JSON.stringify(chips ?? null) === JSON.stringify(DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroChips);
}

function mergeScreenshotItems(
  base: FlightReviewClubRules["lpScreenshotItems"] | undefined,
  overlay: FlightReviewClubRules["lpScreenshotItems"] | undefined,
  preferOverlay = false,
): FlightReviewClubRules["lpScreenshotItems"] {
  if (!Array.isArray(overlay)) return ensureLpScreenshotCoverage(base ?? []);
  if (preferOverlay) return ensureLpScreenshotCoverage(overlay);
  const baseItems = base ?? [];
  const overlayHasImages = overlay.some((item) => item.imageUrl);
  const baseHasImages = baseItems.some((item) => item.imageUrl);
  if (!overlayHasImages && baseHasImages) return ensureLpScreenshotCoverage(baseItems);
  const baseById = new Map(baseItems.map((item) => [item.id, item]));
  return ensureLpScreenshotCoverage(overlay.map((item) => ({
    ...item,
    imageUrl: item.imageUrl || baseById.get(item.id)?.imageUrl || "",
  })));
}

function mergeBenefitItems(
  base: FlightReviewClubRules["lpBenefitItems"] | undefined,
  overlay: FlightReviewClubRules["lpBenefitItems"] | undefined,
  preferOverlay = false,
): FlightReviewClubRules["lpBenefitItems"] {
  if (!Array.isArray(overlay)) return ensureLpBenefitCoverage(base ?? []);
  if (preferOverlay) return ensureLpBenefitCoverage(overlay);
  const baseItems = base ?? [];
  const overlayHasImages = overlay.some((item) => item.imageUrl);
  const baseHasImages = baseItems.some((item) => item.imageUrl);
  if (!overlayHasImages && baseHasImages && overlay.length === baseItems.length) {
    return ensureLpBenefitCoverage(baseItems.map((item, index) => ({
      ...overlay[index],
      ...item,
      text: overlay[index]?.text || item.text,
      imageUrl: overlay[index]?.imageUrl || item.imageUrl,
    })));
  }
  return ensureLpBenefitCoverage(overlay.map((item, index) => ({
    ...item,
    imageUrl: item.imageUrl || baseItems[index]?.imageUrl || "",
  })));
}

function mergeLpSections(
  base: FlightReviewClubRules["lpSections"] | undefined,
  overlay: FlightReviewClubRules["lpSections"] | undefined,
): FlightReviewClubRules["lpSections"] {
  const overlayList = Array.isArray(overlay) && overlay.length > 0 ? overlay : [];
  const baseList = Array.isArray(base) ? base : [];
  const overlayById = new Map(overlayList.map((section) => [section.id, section]));
  const baseById = new Map(baseList.map((section) => [section.id, section]));
  return DEFAULT_LP_SECTIONS.map((section) => ({
    ...(overlayById.get(section.id) || baseById.get(section.id) || section),
  }));
}

function overlayFrcLpContent(
  base: FlightReviewClubRules,
  overlay: Partial<FlightReviewClubRules>,
  preferOverlay = false,
): FlightReviewClubRules {
  const overlayChips = Array.isArray(overlay.lpHeroChips) ? overlay.lpHeroChips : null;
  const keepBaseChips = !preferOverlay
    && overlayChips !== null
    && looksLikeDefaultChips(overlayChips)
    && Array.isArray(base.lpHeroChips)
    && !looksLikeDefaultChips(base.lpHeroChips);
  return {
    ...base,
    lpHeroTitle: overlay.lpHeroTitle || base.lpHeroTitle,
    lpHeroSubtitle: overlay.lpHeroSubtitle || base.lpHeroSubtitle,
    lpHeroEyebrow: overlay.lpHeroEyebrow ?? base.lpHeroEyebrow,
    lpHeroChips: keepBaseChips ? base.lpHeroChips : (overlayChips ?? base.lpHeroChips),
    lpCtaLabel: overlay.lpCtaLabel || base.lpCtaLabel,
    lpCoverImageUrl: preferOverlay
      ? (overlay.lpCoverImageUrl ?? base.lpCoverImageUrl)
      : (overlay.lpCoverImageUrl || base.lpCoverImageUrl),
    lpValueProps: Array.isArray(overlay.lpValueProps) ? overlay.lpValueProps : base.lpValueProps,
    lpBenefitItems: mergeBenefitItems(base.lpBenefitItems, overlay.lpBenefitItems, preferOverlay),
    lpScreenshotItems: mergeScreenshotItems(base.lpScreenshotItems, overlay.lpScreenshotItems, preferOverlay),
    lpSections: mergeLpSections(base.lpSections, overlay.lpSections),
    exclusiveStudentTabs: preferOverlay && Array.isArray(overlay.exclusiveStudentTabs)
      ? overlay.exclusiveStudentTabs
      : base.exclusiveStudentTabs,
    trainingCourses: Object.prototype.hasOwnProperty.call(overlay, "trainingCourses") && Array.isArray(overlay.trainingCourses)
      ? overlay.trainingCourses
      : base.trainingCourses,
  };
}

function frcLpSnapshotBucketId(): string | undefined {
  return NOTICES_BUCKET_ID ?? BUCKET_ID;
}

export async function uploadFrcTrainingPdf(file: File): Promise<string> {
  const bucketId = frcLpSnapshotBucketId();
  if (!storage || !bucketId) {
    throw new Error("Upload de PDF não configurado.");
  }
  if (file.type && file.type !== "application/pdf") {
    throw new Error("Envie um arquivo PDF.");
  }
  const uploaded = await storage.createFile(bucketId, ID.unique(), file, [Permission.read(Role.any())]);
  return storage.getFileView(bucketId, uploaded.$id).toString();
}

export async function uploadFrcTrainingCoverImage(file: File): Promise<string> {
  const bucketId = frcLpSnapshotBucketId();
  if (!storage || !bucketId) {
    throw new Error("Upload de capa não configurado.");
  }
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Envie uma imagem para a capa.");
  }
  const uploaded = await storage.createFile(bucketId, ID.unique(), file, [Permission.read(Role.any())]);
  return storage.getFileView(bucketId, uploaded.$id).toString();
}

function lpFileIdFromUrl(url: string): string {
  const value = String(url || "").trim();
  const match = value.match(/\/files\/([^/?]+)\/(?:view|preview|download)/i);
  return match?.[1] || value;
}

function lpUrlFromRef(ref: string): string {
  const value = String(ref || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  const bucketId = frcLpSnapshotBucketId();
  if (!storage || !bucketId) return value;
  return storage.getFileView(bucketId, value).toString();
}

function expandLpPayload(raw: Partial<FlightReviewClubRules> | null | undefined): Partial<FlightReviewClubRules> | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    ...raw,
    lpCoverImageUrl: lpUrlFromRef(raw.lpCoverImageUrl || ""),
    lpBenefitItems: Array.isArray(raw.lpBenefitItems)
      ? raw.lpBenefitItems.map((item) => ({ ...item, imageUrl: lpUrlFromRef(item.imageUrl || "") }))
      : raw.lpBenefitItems,
    lpScreenshotItems: Array.isArray(raw.lpScreenshotItems)
      ? raw.lpScreenshotItems.map((item) => ({ ...item, imageUrl: lpUrlFromRef(item.imageUrl || "") }))
      : raw.lpScreenshotItems,
  };
}

async function getFrcLandingSettings(): Promise<Partial<FlightReviewClubRules> | null> {
  const doc = await getPlatformSettingDoc(FRC_LP_SETTING_KEY);
  if (!doc) return null;
  const raw = typeof doc.settings_json === "string" ? JSON.parse(doc.settings_json || "{}") : {};
  return expandLpPayload(raw as Partial<FlightReviewClubRules>);
}

async function saveFrcLandingSettings(club: FlightReviewClubRules): Promise<void> {
  writeLocalLpSnapshot(club);
  if (!databases || !DB_ID || !PLATFORM_SETTINGS_COL_ID) {
    throw new Error("Não foi possível gravar a landing: configurações da plataforma indisponíveis.");
  }
  const data = {
    key: FRC_LP_SETTING_KEY,
    settings_json: JSON.stringify(frcLpSnapshotPayload(club)),
  };
  if (data.settings_json.length > APPWRITE_STRING_ATTR_MAX) return;
  const current = await getPlatformSettingDoc(FRC_LP_SETTING_KEY);
  if (current) {
    await databases.updateDocument(DB_ID, PLATFORM_SETTINGS_COL_ID, current.$id, data);
    return;
  }
  const adminPerms = [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
  try {
    await databases.createDocument(DB_ID, PLATFORM_SETTINGS_COL_ID, ID.unique(), data, [
      Permission.read(Role.any()),
      ...adminPerms,
    ]);
  } catch {
    await databases.createDocument(DB_ID, PLATFORM_SETTINGS_COL_ID, ID.unique(), data, adminPerms);
  }
}

function frcLpSnapshotPayload(club: FlightReviewClubRules): Partial<FlightReviewClubRules> & { savedAt: string } {
  return {
    savedAt: new Date().toISOString(),
    lpHeroTitle: club.lpHeroTitle,
    lpHeroSubtitle: club.lpHeroSubtitle,
    lpHeroEyebrow: club.lpHeroEyebrow,
    lpHeroChips: club.lpHeroChips ?? [],
    lpCtaLabel: club.lpCtaLabel,
    lpCoverImageUrl: lpFileIdFromUrl(club.lpCoverImageUrl || ""),
    lpValueProps: club.lpValueProps ?? [],
    lpBenefitItems: (club.lpBenefitItems ?? []).map((item) => ({
      ...item,
      imageUrl: lpFileIdFromUrl(item.imageUrl || ""),
    })),
    lpScreenshotItems: (club.lpScreenshotItems ?? []).map((item) => ({
      ...item,
      imageUrl: lpFileIdFromUrl(item.imageUrl || ""),
    })),
    lpSections: club.lpSections ?? [],
    exclusiveStudentTabs: club.exclusiveStudentTabs ?? [],
  };
}

function readLocalLpSnapshot(): Partial<FlightReviewClubRules> | null {
  try {
    const raw = window.localStorage.getItem(FRC_LP_CACHE_KEY);
    if (!raw) return null;
    return expandLpPayload(JSON.parse(raw) as Partial<FlightReviewClubRules>);
  } catch {
    return null;
  }
}

function writeLocalLpSnapshot(club: FlightReviewClubRules): void {
  try {
    window.localStorage.setItem(FRC_LP_CACHE_KEY, JSON.stringify(frcLpSnapshotPayload(club)));
  } catch {
    // quota
  }
}

async function getFrcLandingSnapshot(): Promise<Partial<FlightReviewClubRules> | null> {
  const bucketId = frcLpSnapshotBucketId();
  if (!storage || !bucketId) return null;
  const url = storage.getFileView(bucketId, FRC_LP_SNAPSHOT_ID).toString();
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}v=${Date.now()}`);
  if (!response.ok) return null;
  const text = await response.text();
  return expandLpPayload(JSON.parse(text) as Partial<FlightReviewClubRules>);
}

export async function saveFrcLandingSnapshot(club: FlightReviewClubRules): Promise<void> {
  writeLocalLpSnapshot(club);
  const bucketId = frcLpSnapshotBucketId();
  if (!storage || !bucketId) return;
  const body = JSON.stringify(frcLpSnapshotPayload(club));
  const files = [
    new File([body], "frc-landing.txt", { type: "text/plain" }),
    new File([body], "frc-landing.json", { type: "application/json" }),
  ];
  let lastError: unknown = null;
  for (const file of files) {
    try {
      try {
        await storage.deleteFile(bucketId, FRC_LP_SNAPSHOT_ID);
      } catch {
        // first publish
      }
      await storage.createFile(bucketId, FRC_LP_SNAPSHOT_ID, file, [Permission.read(Role.any())]);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
}

function frcTrainingSnapshotPayload(trainingCourses: FlightReviewClubTrainingCourse[]): {
  savedAt: string;
  trainingCourses: FlightReviewClubTrainingCourse[];
} {
  return {
    savedAt: new Date().toISOString(),
    trainingCourses: normalizeFlightReviewClubTrainingCourses(trainingCourses),
  };
}

function readLocalTrainingSnapshot(): FlightReviewClubTrainingCourse[] | null {
  try {
    const raw = window.localStorage.getItem(FRC_TRAINING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { trainingCourses?: unknown };
    return normalizeFlightReviewClubTrainingCourses(parsed.trainingCourses);
  } catch {
    return null;
  }
}

function writeLocalTrainingSnapshot(trainingCourses: FlightReviewClubTrainingCourse[]): void {
  try {
    window.localStorage.setItem(FRC_TRAINING_CACHE_KEY, JSON.stringify(frcTrainingSnapshotPayload(trainingCourses)));
  } catch {
    // quota
  }
}

async function getFrcTrainingSnapshot(): Promise<FlightReviewClubTrainingCourse[] | null> {
  const bucketId = frcLpSnapshotBucketId();
  if (!storage || !bucketId) return null;
  const url = storage.getFileView(bucketId, FRC_TRAINING_SNAPSHOT_ID).toString();
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}v=${Date.now()}`);
  if (!response.ok) return null;
  const raw = JSON.parse(await response.text()) as { trainingCourses?: unknown };
  return normalizeFlightReviewClubTrainingCourses(raw.trainingCourses);
}

export async function saveFrcTrainingSnapshot(trainingCourses: FlightReviewClubTrainingCourse[]): Promise<void> {
  writeLocalTrainingSnapshot(trainingCourses);
  const bucketId = frcLpSnapshotBucketId();
  if (!storage || !bucketId) return;
  const body = JSON.stringify(frcTrainingSnapshotPayload(trainingCourses));
  const files = [
    new File([body], "frc-training.txt", { type: "text/plain" }),
    new File([body], "frc-training.json", { type: "application/json" }),
  ];
  let lastError: unknown = null;
  for (const file of files) {
    try {
      try {
        await storage.deleteFile(bucketId, FRC_TRAINING_SNAPSHOT_ID);
      } catch {
        // first publish
      }
      await storage.createFile(bucketId, FRC_TRAINING_SNAPSHOT_ID, file, [Permission.read(Role.any())]);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
}

async function getPlatformSettingDoc(key: string) {
  if (!databases || !DB_ID || !PLATFORM_SETTINGS_COL_ID) return null;
  const result = await databases.listDocuments(DB_ID, PLATFORM_SETTINGS_COL_ID, [
    Query.equal("key", [key]),
    Query.limit(1),
  ]);
  return result.documents[0] ?? null;
}

async function getSchoolRulesDirectFallback(): Promise<SchoolRules> {
  const doc = await getSchoolRulesSettingsDoc();
  if (!doc) return DEFAULT_SCHOOL_RULES;
  const raw = typeof doc.settings_json === "string" ? JSON.parse(doc.settings_json || "{}") : {};
  return normalizeSchoolRules({ ...raw, updatedAt: doc.$updatedAt ?? null });
}

async function getSchoolRulesSettingsDoc() {
  return getPlatformSettingDoc(SCHOOL_RULES_SETTING_KEY);
}

export function applySchoolTheme(
  rules: Pick<SchoolRules, "theme"> | SchoolRules["theme"],
  brand?: BrandApplyOptions,
): void {
  if (typeof document === "undefined") return;
  const theme = "theme" in rules ? rules.theme : rules;
  const root = document.documentElement;

  // Brand colors (primary/accent are always from admin config)
  root.style.setProperty("--school-primary", theme.primaryColor);
  root.style.setProperty("--school-accent", theme.accentColor);
  // --school-bg and --school-surface are intentionally NOT set here:
  // they are derived automatically from [data-theme] in index.css so that
  // switching colorMode correctly changes background/surface colors.

  // Color mode (dark / light) — triggers CSS [data-theme] overrides
  root.dataset.theme = theme.colorMode === "light" ? "light" : "dark";

  // Font family
  if (theme.fontFamily) {
    injectGoogleFont(theme.fontFamily);
    root.style.setProperty("--school-font", `'${theme.fontFamily}', system-ui, 'Segoe UI', Roboto, sans-serif`);
  } else {
    root.style.removeProperty("--school-font");
  }

  // Brand overrides
  if (brand?.schoolName) document.title = brand.schoolName;
  if (brand?.faviconUrl) setFavicon(brand.faviconUrl);
}

/** Reads cached brand data from localStorage and applies it synchronously.
 *  Call this before ReactDOM.render to eliminate FOUC. */
export function preloadBranding(): void {
  if (typeof window === "undefined") return;
  const cachedRules = getCachedSchoolRules();
  let schoolName: string | null = null;
  let faviconUrl: string | null = null;
  try {
    const rawBrand = window.localStorage.getItem("gfv:emailBrandSettings");
    if (rawBrand) {
      const parsed = JSON.parse(rawBrand) as Record<string, unknown>;
      schoolName = typeof parsed.schoolName === "string" ? parsed.schoolName : null;
      faviconUrl = typeof parsed.faviconUrl === "string" ? parsed.faviconUrl : null;
    }
  } catch {
    // ignore
  }
  if (cachedRules) {
    applySchoolTheme(cachedRules, { schoolName, faviconUrl });
  } else if (schoolName) {
    document.title = schoolName;
  }
}

/** Fetches fresh school rules, caches them, and applies the theme.
 *  Should be called after login (fire-and-forget is fine). */
export async function refreshBrandCache(): Promise<void> {
  try {
    const [rules, brand] = await Promise.all([
      getSchoolRules(),
      getEmailBrandSettings().catch(() => null),
    ]);
    cacheSchoolRules(rules);
    applySchoolTheme(rules, brand ? { schoolName: brand.schoolName, faviconUrl: brand.faviconUrl } : undefined);
  } catch {
    // Non-critical — theme already applied from cache
  }
}

