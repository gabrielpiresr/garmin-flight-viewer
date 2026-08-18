import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { AuthPanel } from "../components/AuthPanel";
import { FlightReviewClubCheckoutModal } from "../components/FlightReviewClubCheckoutModal";
import {
  AlbumMockup,
  CourseWebinarMockup,
  DeviceFrame,
  JourneyMockup,
  MarketplaceMockup,
  PartnersMockup,
  PlanningMockup,
  PublicShareMockup,
  ReviewMockup,
  ScheduleMockup,
  SchoolKitMockup,
  StickersMockup,
  TelemetryMockup,
  TrainingMockup,
} from "../components/frc/FlightReviewClubLpMockups";
import { EditableImage, EditableText, LpEditBar, uploadLpAsset } from "../components/frc/LpInlineEdit";
import { getEmailBrandSettings } from "../lib/notificationsDb";
import { getSchoolRules, saveSchoolRules } from "../lib/schoolRulesDb";
import { cancelFlightReviewClubSubscription, getFlightReviewClubStatus, requestFlightReviewClubMemberkitAccess } from "../lib/caktoDb";
import type { FlightReviewClubStatus } from "../types/cakto";
import type { EmailBrandSettings } from "../types/notification";
import {
  DEFAULT_FLIGHT_REVIEW_CLUB_RULES,
  DEFAULT_LP_SECTIONS,
  LP_FEATURE_SECTION_IDS,
  ensureLpBenefitCoverage,
  ensureLpScreenshotCoverage,
  type FlightReviewClubBenefitItem,
  type FlightReviewClubFeatureSectionId,
  type FlightReviewClubLpSection,
  type FlightReviewClubLpSectionId,
  type FlightReviewClubRules,
  type FlightReviewClubScreenshotItem,
  type LpMockupId,
  type SchoolRules,
} from "../types/schoolRules";

const BENEFIT_SEED: Record<FlightReviewClubFeatureSectionId, string> = {
  gravacao: "Novo benefício da gravação",
  agenda: "Novo benefício da agenda",
  premium: "Novo benefício premium",
  parceiros: "Novo benefício de parceiros",
  treinamento: "Novo benefício do treinamento",
  marketplace: "Novo benefício do marketplace",
  kit: "Novo benefício do kit",
};

function renderMockup(id: LpMockupId | ""): ReactNode {
  switch (id) {
    case "telemetry":
      return <TelemetryMockup />;
    case "share":
      return <PublicShareMockup />;
    case "review":
      return <ReviewMockup />;
    case "planning":
      return <PlanningMockup />;
    case "schedule":
      return <ScheduleMockup />;
    case "journey":
      return <JourneyMockup />;
    case "stickers":
      return <StickersMockup />;
    case "album":
      return <AlbumMockup />;
    case "marketplace":
      return <MarketplaceMockup />;
    case "webinar":
      return <div className="bg-slate-950 p-3"><CourseWebinarMockup /></div>;
    case "partners":
      return <div className="bg-slate-950 p-3"><PartnersMockup /></div>;
    case "training":
      return <div className="bg-slate-950 p-3"><TrainingMockup /></div>;
    case "kit":
      return <div className="bg-slate-950 p-3"><SchoolKitMockup /></div>;
    default:
      return (
        <div className="flex aspect-[16/10] items-center justify-center bg-slate-900 text-sm text-slate-500">
          Adicione um print
        </div>
      );
  }
}

function cloneClub(club: FlightReviewClubRules): FlightReviewClubRules {
  return {
    ...club,
    lpValueProps: [...club.lpValueProps],
    lpHeroChips: [...(club.lpHeroChips ?? [])],
    lpBenefitItems: ensureLpBenefitCoverage(club.lpBenefitItems.map((item) => ({ ...item }))),
    lpScreenshotItems: ensureLpScreenshotCoverage(club.lpScreenshotItems.map((item) => ({ ...item }))),
    lpSections: DEFAULT_LP_SECTIONS.map((section) => {
      const saved = club.lpSections?.find((item) => item.id === section.id);
      return { ...(saved ?? section) };
    }),
    benefits: [...club.benefits],
    subscriptionPlans: club.subscriptionPlans.map((item) => ({ ...item })),
  };
}

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#071018]">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

function formatRenewalDate(value: string | null | undefined): string {
  if (!value) return "data ainda não disponível";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function sectionCopy(club: FlightReviewClubRules, id: FlightReviewClubLpSectionId): FlightReviewClubLpSection {
  return club.lpSections?.find((item) => item.id === id) ?? DEFAULT_LP_SECTIONS.find((item) => item.id === id)!;
}

export function FlightReviewClubPage() {
  const { user, isRoot } = useAuth();
  const canEdit = user?.role === "admin" || isRoot;
  const [settings, setSettings] = useState<SchoolRules | null>(null);
  const [club, setClub] = useState<FlightReviewClubRules | null>(null);
  const [draft, setDraft] = useState<FlightReviewClubRules | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [brand, setBrand] = useState<EmailBrandSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [frcStatus, setFrcStatus] = useState<FlightReviewClubStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [memberkitBusy, setMemberkitBusy] = useState(false);
  const [memberkitMessage, setMemberkitMessage] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [pendingCheckoutAfterAuth, setPendingCheckoutAfterAuth] = useState(false);
  const autoEditStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getSchoolRules().catch(() => null),
      getEmailBrandSettings().catch(() => null),
    ]).then(([rules, brandSettings]) => {
      if (cancelled) return;
      setSettings(rules);
      setClub(rules?.flightReviewClub ?? null);
      setBrand(brandSettings);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user || user.role !== "aluno") {
      setFrcStatus(null);
      setStatusLoading(false);
      return;
    }
    let cancelled = false;
    setStatusLoading(true);
    void getFlightReviewClubStatus()
      .then((status) => {
        if (!cancelled) setFrcStatus(status);
      })
      .catch(() => {
        if (!cancelled) setFrcStatus(null);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !pendingCheckoutAfterAuth) return;
    setPendingCheckoutAfterAuth(false);
    setAuthOpen(false);
    if (user.role === "aluno") setCheckoutOpen(true);
    else setCheckoutError("A assinatura do Flight Review Club está disponível para alunos.");
  }, [pendingCheckoutAfterAuth, user]);

  const viewClub = editing && draft ? draft : club;
  const dirty = Boolean(editing && draft && club && JSON.stringify(draft) !== JSON.stringify(club));

  useEffect(() => {
    if (autoEditStarted.current || !canEdit || !club) return;
    if (new URLSearchParams(window.location.search).get("edit") === "1") {
      autoEditStarted.current = true;
      setDraft(cloneClub(club));
      setEditing(true);
    }
  }, [canEdit, club]);

  const enabledPlans = useMemo(() => {
    return (viewClub?.subscriptionPlans ?? []).filter((plan) => plan.enabled && plan.amount > 0)
      .sort((a, b) => a.amount - b.amount);
  }, [viewClub]);
  const activePlan = enabledPlans[0] ?? null;

  function patchDraft(patch: Partial<FlightReviewClubRules>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function startEdit() {
    if (!club) return;
    setEditMessage(null);
    setDraft(cloneClub(club));
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(null);
    setEditing(false);
    setEditMessage(null);
  }

  async function saveEdit() {
    if (!draft) return;
    setSaving(true);
    setEditMessage(null);
    try {
      const current = settings ?? await getSchoolRules();
      const { updatedAt: _updatedAt, ...input } = current;
      const nextClub = {
        ...draft,
        benefits: draft.lpBenefitItems.map((item) => item.text).filter(Boolean),
      };
      const saved = await saveSchoolRules({ ...input, flightReviewClub: nextClub });
      const club = {
        ...saved.flightReviewClub,
        lpHeroTitle: nextClub.lpHeroTitle,
        lpHeroSubtitle: nextClub.lpHeroSubtitle,
        lpHeroEyebrow: nextClub.lpHeroEyebrow,
        lpHeroChips: nextClub.lpHeroChips,
        lpCtaLabel: nextClub.lpCtaLabel,
        lpCoverImageUrl: nextClub.lpCoverImageUrl,
        lpValueProps: nextClub.lpValueProps,
        lpBenefitItems: nextClub.lpBenefitItems,
        lpScreenshotItems: nextClub.lpScreenshotItems,
        lpSections: nextClub.lpSections,
      };
      setSettings({ ...saved, flightReviewClub: club });
      setClub(club);
      setDraft(cloneClub(club));
      setEditMessage("Landing salva.");
    } catch (err) {
      setEditMessage((err as Error).message || "Não foi possível salvar a landing.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(key: string, file: File, apply: (url: string) => void) {
    setUploadingKey(key);
    setEditMessage(null);
    try {
      apply(await uploadLpAsset(file));
    } catch (err) {
      setEditMessage((err as Error).message || "Não foi possível enviar a imagem.");
    } finally {
      setUploadingKey(null);
    }
  }

  function patchScreenshot(id: string, patch: Partial<FlightReviewClubScreenshotItem>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        lpScreenshotItems: current.lpScreenshotItems.map((item) => item.id === id ? { ...item, ...patch } : item),
      };
    });
  }

  function addScreenshot(sectionId: FlightReviewClubFeatureSectionId) {
    const id = `shot-${Date.now().toString(36)}`;
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        lpScreenshotItems: [
          ...current.lpScreenshotItems,
          {
            id,
            sectionId,
            title: "Novo print",
            description: "",
            imageUrl: "",
            frameUrl: "epeac.app",
            mockupId: "",
          },
        ],
      };
    });
  }

  function removeScreenshot(id: string) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        lpScreenshotItems: current.lpScreenshotItems.filter((item) => item.id !== id),
      };
    });
  }

  function patchSection(id: FlightReviewClubLpSectionId, patch: Partial<FlightReviewClubLpSection>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        lpSections: current.lpSections.map((item) => item.id === id ? { ...item, ...patch } : item),
      };
    });
  }

  if (loading) return <LoadingState />;

  if (!viewClub || (!viewClub.enabled && !canEdit)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#071018] px-4 text-slate-100">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-300/80">Flight Review Club</p>
          <h1 className="mt-2 text-2xl font-black">Programa não disponível</h1>
          <p className="mt-2 text-sm text-slate-400">O Flight Review Club ainda não está disponível nesta escola.</p>
        </div>
      </div>
    );
  }

  const activeClub = viewClub;
  const benefitItems = activeClub.lpBenefitItems.length > 0
    ? activeClub.lpBenefitItems
    : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpBenefitItems;
  const heroChips = Array.isArray(activeClub.lpHeroChips)
    ? activeClub.lpHeroChips
    : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroChips;
  const navSections = LP_FEATURE_SECTION_IDS.map((id) => sectionCopy(activeClub, id));
  const schoolName = brand?.schoolName?.trim() || "Flight Review Club";
  const logoSrc = brand?.logoDataUrl || brand?.logoUrl || null;
  const coverImageUrl = activeClub.lpCoverImageUrl.trim();
  const hasFrcAccess = frcStatus?.hasAccess === true;
  const membership = frcStatus?.membership ?? null;
  const memberkit = frcStatus?.memberkit ?? null;
  const memberkitEmail = memberkit?.email || user?.email || "";
  const canCancel = Boolean(membership?.caktoSubscriptionId && ["active", "trial"].includes(membership.status));

  async function handleCta() {
    if (editing) return;
    setCheckoutError(null);
    if (frcStatus?.hasAccess) return;
    if (user?.role === "aluno") {
      setCheckoutOpen(true);
      return;
    }
    if (!user) {
      setPendingCheckoutAfterAuth(true);
      setAuthOpen(true);
      return;
    }
    if (activeClub.ctaSubscriptionUrl) {
      window.open(activeClub.ctaSubscriptionUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setCheckoutError("A assinatura do Flight Review Club está disponível para alunos.");
  }

  async function handleCancelSubscription() {
    if (cancelBusy) return;
    setCancelBusy(true);
    setCheckoutError(null);
    try {
      setFrcStatus(await cancelFlightReviewClubSubscription());
    } catch (err) {
      setCheckoutError((err as Error).message || "Não foi possível cancelar sua assinatura agora.");
    } finally {
      setCancelBusy(false);
    }
  }

  async function handleMemberkitAccess(openNow: boolean) {
    if (memberkitBusy) return;
    setMemberkitBusy(true);
    setMemberkitMessage(null);
    setCheckoutError(null);
    try {
      const result = await requestFlightReviewClubMemberkitAccess();
      setMemberkitMessage(
        openNow
          ? result.message
          : `${result.message} Se o e-mail não chegou, clique em Acessar Clube 360.`,
      );
      setFrcStatus((current) => current ? {
        ...current,
        memberkit: {
          configured: true,
          granted: result.granted,
          email: result.email,
          syncedAt: new Date().toISOString(),
          error: "",
          membersUrl: result.membersUrl,
        },
      } : current);
      const url = result.authenticatedUrl || result.membersUrl;
      if (openNow && url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setCheckoutError((err as Error).message || "Não foi possível solicitar o acesso ao Clube 360 agora.");
    } finally {
      setMemberkitBusy(false);
    }
  }

  const ctaLabel = hasFrcAccess && !editing ? "Assinatura ativa" : activeClub.lpCtaLabel;
  const ctaDisabled = !editing && (hasFrcAccess || statusLoading);
  const insidePlatform = user?.role === "aluno";

  return (
    <div className={`${insidePlatform ? "min-h-0" : "min-h-screen"} bg-[#071018] text-slate-100 ${editing ? "pb-28" : ""}`}>
      {!activeClub.enabled && canEdit ? (
        <div className="bg-amber-400 px-4 py-2 text-center text-sm font-bold text-amber-950">
          FRC está desativado. Alunos não veem esta página. Você pode editar mesmo assim.
        </div>
      ) : null}
      {insidePlatform ? null : (
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#071018]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <a href={canEdit ? "/admin/frc" : "/"} className="flex min-w-0 items-center gap-3">
            {logoSrc ? <img src={logoSrc} alt={schoolName} className="h-10 w-auto max-w-40 object-contain" /> : null}
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/80">{schoolName}</p>
              <p className="text-sm font-black text-white">Flight Review Club</p>
            </div>
          </a>
          <nav className="hidden items-center gap-1 lg:flex">
            {navSections.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                {editing ? (
                  <EditableText
                    as="span"
                    editing={editing}
                    value={item.navLabel}
                    maxLength={40}
                    onChange={(value) => patchSection(item.id, { navLabel: value || item.navLabel })}
                    className="text-xs font-semibold"
                  />
                ) : (
                  item.navLabel
                )}
              </a>
            ))}
          </nav>
          {editing ? (
            <EditableText
              as="span"
              editing={editing}
              value={activeClub.lpCtaLabel}
              maxLength={80}
              onChange={(value) => patchDraft({ lpCtaLabel: value || DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpCtaLabel })}
              className="inline-flex rounded-xl bg-sky-300 px-4 py-2 text-sm font-black text-slate-950"
            />
          ) : (
            <button
              type="button"
              onClick={() => void handleCta()}
              disabled={ctaDisabled}
              className="rounded-xl bg-sky-300 px-4 py-2 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/30 transition hover:bg-sky-200 disabled:cursor-default disabled:border disabled:border-emerald-300/40 disabled:bg-emerald-300/10 disabled:text-emerald-100"
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </header>
      )}

      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          {coverImageUrl ? (
            <img src={coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),transparent_48%),linear-gradient(180deg,rgba(7,16,24,0.72),rgba(7,16,24,0.92))]" />
          {editing ? (
            <div className="absolute right-5 top-5 z-10">
              <label className="inline-flex cursor-pointer rounded-lg bg-sky-300 px-3 py-1.5 text-xs font-black text-slate-950">
                {uploadingKey === "cover" ? "Enviando capa..." : coverImageUrl ? "Trocar capa" : "Adicionar capa"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void handleImageUpload("cover", file, (url) => patchDraft({ lpCoverImageUrl: url }));
                  }}
                />
              </label>
            </div>
          ) : null}
          <div className={`relative mx-auto flex max-w-4xl flex-col items-center justify-center px-5 py-20 text-center sm:py-24 ${insidePlatform ? "" : "min-h-[calc(100vh-74px)]"}`}>
            <EditableText
              editing={editing}
              value={activeClub.lpHeroEyebrow || DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroEyebrow}
              maxLength={80}
              onChange={(value) => patchDraft({ lpHeroEyebrow: value || DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroEyebrow })}
              className="text-xs font-bold uppercase tracking-[0.28em] text-sky-200/80"
            />
            <EditableText
              as="h1"
              editing={editing}
              value={activeClub.lpHeroTitle || "Flight Review Club"}
              maxLength={180}
              onChange={(value) => patchDraft({ lpHeroTitle: value || "Flight Review Club" })}
              className="mt-5 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl"
            />
            <EditableText
              as="p"
              editing={editing}
              multiline
              value={activeClub.lpHeroSubtitle}
              maxLength={600}
              onChange={(value) => patchDraft({ lpHeroSubtitle: value })}
              className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg"
            />
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {editing ? (
                <EditableText
                  as="span"
                  editing={editing}
                  value={activeClub.lpCtaLabel}
                  maxLength={80}
                  onChange={(value) => patchDraft({ lpCtaLabel: value || DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpCtaLabel })}
                  className="inline-flex rounded-xl bg-sky-300 px-6 py-3 text-sm font-black text-slate-950"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => void handleCta()}
                  disabled={ctaDisabled}
                  className="rounded-xl bg-sky-300 px-6 py-3 text-sm font-black text-slate-950 shadow-xl shadow-sky-950/40 transition hover:bg-sky-200 disabled:cursor-default disabled:border disabled:border-emerald-300/40 disabled:bg-emerald-300/10 disabled:text-emerald-100"
                >
                  {hasFrcAccess ? "Você já tem acesso" : activeClub.lpCtaLabel}
                </button>
              )}
              {activePlan ? (
                <div className="rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-left">
                  <p className="text-xs text-slate-400">A partir de</p>
                  <p className="text-xl font-black text-white">
                    {formatCurrency(activePlan.amount)}{" "}
                    <span className="text-xs font-semibold text-slate-400">/{activePlan.label.toLowerCase()}</span>
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {heroChips.map((chip, index) => (
                <span key={`${chip}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                  <EditableText
                    as="span"
                    editing={editing}
                    value={chip}
                    maxLength={40}
                    onChange={(value) => {
                      const next = heroChips.map((item, itemIndex) => itemIndex === index ? value : item).filter(Boolean);
                      patchDraft({ lpHeroChips: next });
                    }}
                    className="text-[11px] font-semibold"
                  />
                  {editing ? (
                    <button
                      type="button"
                      onClick={() => patchDraft({ lpHeroChips: heroChips.filter((_, itemIndex) => itemIndex !== index) })}
                      className="text-slate-500 hover:text-red-300"
                      aria-label="Remover chip"
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
              {editing ? (
                <button
                  type="button"
                  onClick={() => patchDraft({ lpHeroChips: [...heroChips, "Novo item"] })}
                  className="rounded-full border border-dashed border-sky-400/40 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-400/10"
                >
                  + Chip
                </button>
              ) : null}
            </div>
            {checkoutError ? <p className="mt-4 max-w-xl text-sm text-amber-200">{checkoutError}</p> : null}
          </div>
        </section>

        {LP_FEATURE_SECTION_IDS.map((id, index) => (
          <FeatureSection
            key={id}
            id={id}
            reverse={index % 2 === 1}
            muted={index % 2 === 0}
            editing={editing}
            section={sectionCopy(activeClub, id)}
            onSectionChange={(patch) => patchSection(id, patch)}
            benefits={benefitItems.filter((item) => item.sectionId === id)}
            benefitItems={benefitItems}
            onBenefitsChange={(items) => patchDraft({ lpBenefitItems: items })}
            onAddBenefit={() => patchDraft({
              lpBenefitItems: [...benefitItems, { sectionId: id, text: BENEFIT_SEED[id], imageUrl: "" }],
            })}
            onUploadBenefit={(benefitIndex, file) => void handleImageUpload(`benefit-${benefitIndex}`, file, (url) => {
              patchDraft({
                lpBenefitItems: benefitItems.map((item, itemIndex) => itemIndex === benefitIndex ? { ...item, imageUrl: url } : item),
              });
            })}
            slides={activeClub.lpScreenshotItems.filter((item) => item.sectionId === id)}
            uploadingKey={uploadingKey}
            onUploadSlide={(slideId, file) => void handleImageUpload(slideId, file, (url) => patchScreenshot(slideId, { imageUrl: url }))}
            onClearSlide={(slideId) => patchScreenshot(slideId, { imageUrl: "" })}
            onPatchSlide={(slideId, patch) => patchScreenshot(slideId, patch)}
            onAddSlide={() => addScreenshot(id)}
            onRemoveSlide={removeScreenshot}
          />
        ))}

        <section id="assinar" className="scroll-mt-24">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:py-24">
            <div className="max-w-2xl">
              <SectionIntro
                editing={editing}
                section={sectionCopy(activeClub, "assinar")}
                onChange={(patch) => patchSection("assinar", patch)}
              />
              <div className="mt-8 rounded-2xl border border-white/10 bg-[#0d1b24] p-5">
                {hasFrcAccess ? (
                  <>
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-200/80">Seu acesso</p>
                    <h3 className="mt-2 text-xl font-black text-white">{membership?.planName || "Flight Review Club"}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      Próxima renovação: <span className="font-semibold text-slate-200">{formatRenewalDate(membership?.nextPaymentDate)}</span>.
                    </p>
                    {membership?.cancelAtPeriodEnd ? (
                      <p className="mt-2 text-sm leading-6 text-amber-200">
                        Cancelamento agendado. Acesso mantido até {formatRenewalDate(membership.accessUntil || membership.nextPaymentDate)}.
                      </p>
                    ) : null}
                    {user?.role === "aluno" ? (
                      <div className="mt-5 rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-emerald-200/90">Clube 360</p>
                        <p className="mt-2 text-sm leading-6 text-emerald-50">
                          {memberkit?.granted
                            ? `Seu acesso ao Clube 360 já foi liberado. A Memberkit enviou o login para ${memberkitEmail || "o e-mail da sua conta"}.`
                            : `Seu benefício do Clube 360 está incluído. A Memberkit envia o acesso para ${memberkitEmail || "o e-mail da sua conta"}.`}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-emerald-100/70">
                          Confira a caixa de entrada e o spam. Se não chegou, solicite de novo ou entre direto pela área de membros.
                        </p>
                        {memberkitMessage ? <p className="mt-2 text-xs font-semibold text-emerald-100">{memberkitMessage}</p> : null}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleMemberkitAccess(true)}
                            disabled={memberkitBusy}
                            className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60"
                          >
                            {memberkitBusy ? "Liberando..." : "Acessar Clube 360"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleMemberkitAccess(false)}
                            disabled={memberkitBusy}
                            className="rounded-lg border border-emerald-200/40 px-4 py-2 text-sm font-bold text-emerald-50 transition hover:bg-emerald-300/10 disabled:opacity-60"
                          >
                            {memberkitBusy ? "Enviando..." : "Solicitar novamente"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {canCancel ? (
                      <button
                        type="button"
                        onClick={() => void handleCancelSubscription()}
                        disabled={cancelBusy}
                        className="mt-5 rounded-lg border border-red-300/35 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/10 disabled:opacity-60"
                      >
                        {cancelBusy ? "Cancelando..." : "Cancelar renovação"}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold uppercase tracking-widest text-sky-200/80">Plano</p>
                    <h3 className="mt-2 text-xl font-black text-white">{activePlan ? activePlan.label : "Assinatura FRC"}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      {activePlan
                        ? `${formatCurrency(activePlan.amount)} a cada ${activePlan.recurrencePeriodDays} dias.`
                        : "Escolha o plano disponível no checkout da escola."}
                    </p>
                    {editing ? (
                      <EditableText
                        as="span"
                        editing={editing}
                        value={activeClub.lpCtaLabel}
                        maxLength={80}
                        onChange={(value) => patchDraft({ lpCtaLabel: value || DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpCtaLabel })}
                        className="mt-5 inline-flex rounded-xl bg-sky-300 px-7 py-3 text-sm font-black text-slate-950"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleCta()}
                        disabled={ctaDisabled}
                        className="mt-5 rounded-xl bg-sky-300 px-7 py-3 text-sm font-black text-slate-950 shadow-xl shadow-sky-950/40 transition hover:bg-sky-200 disabled:cursor-default disabled:border disabled:border-emerald-300/40 disabled:bg-emerald-300/10 disabled:text-emerald-100"
                      >
                        {ctaLabel}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <LpEditBar
        editing={editing}
        canEdit={canEdit}
        saving={saving}
        dirty={dirty}
        message={editMessage}
        onStart={startEdit}
        onSave={() => void saveEdit()}
        onCancel={cancelEdit}
      />

      <FlightReviewClubCheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        fallbackUrl={activeClub.ctaSubscriptionUrl}
        adhesionTermUrl={activeClub.adhesionTermUrl}
        plans={activeClub.subscriptionPlans}
        billingMode={activeClub.billingMode}
      />
      {authOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/80 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6" onClick={() => setAuthOpen(false)}>
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-sky-300/80">Entrar para assinar</p>
                <h3 className="mt-1 text-lg font-black text-white">Acesse sua conta de aluno</h3>
              </div>
              <button type="button" onClick={() => setAuthOpen(false)} className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">
                Fechar
              </button>
            </div>
            <AuthPanel />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionIntro({
  editing,
  section,
  onChange,
}: {
  editing: boolean;
  section: FlightReviewClubLpSection;
  onChange: (patch: Partial<FlightReviewClubLpSection>) => void;
}) {
  return (
    <div className="max-w-2xl">
      <EditableText
        editing={editing}
        value={section.eyebrow}
        maxLength={80}
        onChange={(value) => onChange({ eyebrow: value })}
        className="text-xs font-bold uppercase tracking-[0.24em] text-sky-200/75"
      />
      <EditableText
        as="h2"
        editing={editing}
        multiline
        value={section.title}
        maxLength={180}
        onChange={(value) => onChange({ title: value })}
        className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl"
      />
      <EditableText
        editing={editing}
        multiline
        value={section.copy}
        maxLength={600}
        onChange={(value) => onChange({ copy: value })}
        className="mt-3 text-sm leading-7 text-slate-400"
      />
    </div>
  );
}

function FeatureSection({
  id,
  reverse = false,
  muted = true,
  editing,
  section,
  onSectionChange,
  benefits,
  benefitItems,
  onBenefitsChange,
  onAddBenefit,
  onUploadBenefit,
  slides,
  uploadingKey,
  onUploadSlide,
  onClearSlide,
  onPatchSlide,
  onAddSlide,
  onRemoveSlide,
}: {
  id: FlightReviewClubFeatureSectionId;
  reverse?: boolean;
  muted?: boolean;
  editing: boolean;
  section: FlightReviewClubLpSection;
  onSectionChange: (patch: Partial<FlightReviewClubLpSection>) => void;
  benefits: FlightReviewClubBenefitItem[];
  benefitItems: FlightReviewClubBenefitItem[];
  onBenefitsChange: (items: FlightReviewClubBenefitItem[]) => void;
  onAddBenefit: () => void;
  onUploadBenefit: (index: number, file: File) => void;
  slides: FlightReviewClubScreenshotItem[];
  uploadingKey: string | null;
  onUploadSlide: (id: string, file: File) => void;
  onClearSlide: (id: string) => void;
  onPatchSlide: (id: string, patch: Partial<FlightReviewClubScreenshotItem>) => void;
  onAddSlide: () => void;
  onRemoveSlide: (id: string) => void;
}) {
  return (
    <section id={id} className={`scroll-mt-24 border-b border-white/10 ${muted ? "bg-[#0b141c]" : "bg-[#12222c]"}`}>
      <div className={`mx-auto flex max-w-7xl flex-col items-center gap-10 px-5 py-20 sm:py-24 lg:flex-row ${reverse ? "lg:flex-row-reverse" : ""}`}>
        <div className="w-full lg:w-1/2">
          <SectionIntro editing={editing} section={section} onChange={onSectionChange} />
          <BenefitList
            editing={editing}
            items={benefits}
            allItems={benefitItems}
            onChange={onBenefitsChange}
            onAdd={onAddBenefit}
            onUpload={onUploadBenefit}
            uploadingKey={uploadingKey}
          />
        </div>
        <div className="w-full lg:w-1/2">
          <MockupCarousel
            editing={editing}
            slides={slides}
            uploadingKey={uploadingKey}
            onUpload={onUploadSlide}
            onClear={onClearSlide}
            onPatch={onPatchSlide}
            onAdd={onAddSlide}
            onRemove={onRemoveSlide}
          />
        </div>
      </div>
    </section>
  );
}

function MockupCarousel({
  editing,
  slides,
  uploadingKey,
  onUpload,
  onClear,
  onPatch,
  onAdd,
  onRemove,
}: {
  editing: boolean;
  slides: FlightReviewClubScreenshotItem[];
  uploadingKey: string | null;
  onUpload: (id: string, file: File) => void;
  onClear: (id: string) => void;
  onPatch: (id: string, patch: Partial<FlightReviewClubScreenshotItem>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragStartX = useRef<number | null>(null);
  const safeIndex = slides.length === 0 ? 0 : Math.min(index, slides.length - 1);
  const slide = slides[safeIndex];

  useEffect(() => {
    if (index !== safeIndex) setIndex(safeIndex);
  }, [index, safeIndex]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  function go(delta: number) {
    if (slides.length < 2) return;
    setIndex((current) => (current + delta + slides.length) % slides.length);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[contenteditable='true'], button, label, input")) return;
    dragStartX.current = event.clientX;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStartX.current == null) return;
    const dx = event.clientX - dragStartX.current;
    dragStartX.current = null;
    if (dx > 50) go(-1);
    else if (dx < -50) go(1);
  }

  if (!slide && !editing) return null;

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {slides.length > 0 ? (
        <>
          <div className="relative">
            <div
              className="overflow-hidden rounded-2xl"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => { dragStartX.current = null; }}
            >
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${safeIndex * 100}%)` }}
              >
                {slides.map((item) => (
                  <div key={item.id} className="w-full shrink-0">
                    <DeviceFrame
                      url={
                        <EditableText
                          as="span"
                          editing={editing && item.id === slide?.id}
                          value={item.frameUrl}
                          maxLength={120}
                          onChange={(value) => onPatch(item.id, { frameUrl: value || "epeac.app" })}
                          className="text-[10px] text-slate-500"
                        />
                      }
                    >
                      <EditableImage
                        editing={editing && item.id === slide?.id}
                        src={item.imageUrl}
                        uploading={uploadingKey === item.id}
                        onUpload={(file) => onUpload(item.id, file)}
                        onClear={() => onClear(item.id)}
                      >
                        {renderMockup(item.mockupId)}
                      </EditableImage>
                    </DeviceFrame>
                  </div>
                ))}
              </div>
            </div>
            {slides.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/80 text-xl text-white shadow-lg hover:bg-slate-900"
                  aria-label="Slide anterior"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/80 text-xl text-white shadow-lg hover:bg-slate-900"
                  aria-label="Próximo slide"
                >
                  ›
                </button>
              </>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            {slide ? (
              <EditableText
                editing={editing}
                value={slide.title}
                maxLength={120}
                onChange={(value) => onPatch(slide.id, { title: value || slide.title })}
                className="text-sm font-semibold text-slate-200"
              />
            ) : <span />}
            {slides.length > 1 ? (
              <div className="flex gap-1.5">
                {slides.map((item, itemIndex) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIndex(itemIndex)}
                    className={`h-2.5 w-2.5 rounded-full ${itemIndex === safeIndex ? "bg-sky-300" : "bg-white/20"}`}
                    aria-label={`Ir para ${item.title}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
          {slide && editing ? (
            <EditableText
              editing={editing}
              multiline
              value={slide.description}
              maxLength={400}
              onChange={(value) => onPatch(slide.id, { description: value })}
              className="mt-1 text-xs leading-5 text-slate-500"
            />
          ) : slide?.description ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">{slide.description}</p>
          ) : null}
        </>
      ) : null}
      {editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {slides.map((item, itemIndex) => (
            <span
              key={item.id}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                itemIndex === safeIndex ? "border-sky-400/50 bg-sky-400/10 text-sky-100" : "border-white/10 text-slate-400"
              }`}
            >
              <button type="button" onClick={() => setIndex(itemIndex)}>
                {item.title}
              </button>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="text-slate-500 hover:text-red-300"
                aria-label={`Remover ${item.title}`}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg border border-dashed border-sky-400/40 px-2 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-400/10"
          >
            + Print
          </button>
          {slide ? (
            <button
              type="button"
              onClick={() => onRemove(slide.id)}
              className="rounded-lg px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
            >
              Remover mockup
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BenefitList({
  editing,
  items,
  allItems,
  onChange,
  onAdd,
  onUpload,
  uploadingKey,
}: {
  editing: boolean;
  items: FlightReviewClubBenefitItem[];
  allItems: FlightReviewClubBenefitItem[];
  onChange: (items: FlightReviewClubBenefitItem[]) => void;
  onAdd: () => void;
  onUpload: (index: number, file: File) => void;
  uploadingKey: string | null;
}) {
  if (items.length === 0 && !editing) return null;
  return (
    <ul className={`mt-6 grid gap-3 ${items.length > 1 ? "sm:grid-cols-2" : ""}`}>
      {items.map((item) => {
        const index = allItems.indexOf(item);
        return (
          <li key={`${item.sectionId}-${item.text}-${index}`} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#0d1b24] p-4">
            {editing ? (
              <label className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-[9px] font-bold text-slate-500">Foto</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file && index >= 0) onUpload(index, file);
                  }}
                />
                {uploadingKey === `benefit-${index}` ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-[9px] text-white">...</span>
                ) : null}
              </label>
            ) : item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-400 text-[11px] font-black text-slate-950">
                ✓
              </span>
            )}
            <EditableText
              editing={editing}
              multiline
              value={item.text}
              maxLength={500}
              onChange={(value) => {
                if (index < 0) return;
                onChange(allItems.map((current, itemIndex) => itemIndex === index ? { ...current, text: value } : current));
              }}
              className="min-w-0 flex-1 self-center text-sm leading-6 text-slate-200"
            />
            {editing ? (
              <button
                type="button"
                onClick={() => {
                  if (index < 0) return;
                  onChange(allItems.filter((_, itemIndex) => itemIndex !== index));
                }}
                className="rounded px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
              >
                Remover
              </button>
            ) : null}
          </li>
        );
      })}
      {editing ? (
        <li className={items.length > 1 ? "sm:col-span-2" : ""}>
          <button
            type="button"
            onClick={onAdd}
            className="w-full rounded-2xl border border-dashed border-sky-400/40 px-3 py-3 text-sm font-semibold text-sky-200 hover:bg-sky-400/10"
          >
            Adicionar benefício
          </button>
        </li>
      ) : null}
    </ul>
  );
}
