import type { ReactElement } from "react";
import { renderRichContent } from "../../lib/maneuverContent";
import { getOnboardingImageUrl } from "../../lib/onboardingDb";
import type { OnboardingStep, SlideLayout } from "../../types/onboarding";

type SlideProps = {
  step: OnboardingStep;
};

// ─── Shared Atoms ─────────────────────────────────────────────────────────────

function TopBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
      <span className="text-xs font-medium tracking-widest text-cyan-300 uppercase">Apresentação</span>
    </div>
  );
}

/** Scrollable slide shell — allows inner content to scroll when too tall */
function SlideShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`h-full w-full overflow-y-auto ${className}`}>
      <div className="flex min-h-full flex-col items-center justify-center px-8 py-24">
        {children}
      </div>
    </div>
  );
}

function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  const isYoutube = /youtube\.com|youtu\.be/.test(videoUrl);
  if (isYoutube) {
    const videoId = videoUrl.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
    const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : videoUrl;
    return (
      <div className="relative overflow-hidden rounded-2xl bg-black pb-[56.25%] shadow-2xl">
        <iframe
          src={embedUrl}
          className="absolute inset-0 h-full w-full"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl shadow-2xl">
      <video src={videoUrl} controls className="w-full rounded-2xl" />
    </div>
  );
}

function ImageBlock({ fileId, alt = "" }: { fileId: string; alt?: string }) {
  const url = getOnboardingImageUrl(fileId);
  if (!url) return null;
  return (
    <div className="overflow-hidden rounded-2xl shadow-2xl">
      <img src={url} alt={alt} className="w-full object-cover" />
    </div>
  );
}

function MediaBlock({ step }: { step: OnboardingStep }) {
  if (step.videoUrl) return <VideoPlayer videoUrl={step.videoUrl} />;
  if (step.imageFileId) return <ImageBlock fileId={step.imageFileId} alt={step.title} />;
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-slate-800/50">
      <div className="text-center">
        <svg className="mx-auto mb-2 h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-xs text-slate-500">Adicione imagem ou vídeo</p>
      </div>
    </div>
  );
}

function RichContent({ step, size = "base" }: { step: OnboardingStep; size?: "sm" | "base" | "lg" }) {
  const sizeClass = size === "sm" ? "text-sm" : size === "lg" ? "text-base md:text-lg" : "text-sm md:text-base";
  const hasRich =
    step.descriptionJson &&
    typeof step.descriptionJson === "object" &&
    "type" in step.descriptionJson &&
    (step.descriptionJson as { content?: unknown[] }).content?.length;

  if (hasRich) {
    return (
      <div className={`maneuver-article-content space-y-2 leading-relaxed text-slate-300 ${sizeClass}`}>
        {renderRichContent(step.descriptionJson)}
      </div>
    );
  }
  if (step.description) {
    return <p className={`leading-relaxed text-slate-300 ${sizeClass}`}>{step.description}</p>;
  }
  return null;
}

// ─── HERO ────────────────────────────────────────────────────────────────────
export function HeroSlide({ step }: SlideProps) {
  const imageUrl = step.imageFileId ? getOnboardingImageUrl(step.imageFileId) : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Background */}
      {imageUrl ? (
        <div className="absolute inset-0">
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-slate-950/40 to-slate-950/90" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950" />
      )}

      {/* Scrollable content over bg */}
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="flex min-h-full flex-col items-center justify-center gap-6 px-8 py-24 text-center">
          <TopBadge />
          <div>
            <h1 className="mb-3 text-4xl font-bold leading-tight text-white md:text-5xl">{step.title}</h1>
            {step.subtitle && (
              <p className="text-lg text-slate-300 md:text-xl">{step.subtitle}</p>
            )}
          </div>
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-sm">
            <RichContent step={step} size="base" />
          </div>
          {step.videoUrl && (
            <div className="w-full max-w-3xl">
              <VideoPlayer videoUrl={step.videoUrl} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SPLIT ───────────────────────────────────────────────────────────────────
export function SplitSlide({ step }: SlideProps) {
  const reverse = step.mediaPosition === "left";

  const TextCol = (
    <div className="flex flex-col gap-4">
      <TopBadge />
      <div>
        <h1 className="mb-2 text-3xl font-bold leading-tight text-white md:text-4xl">{step.title}</h1>
        {step.subtitle && (
          <p className="text-base text-slate-400">{step.subtitle}</p>
        )}
      </div>
      <div className="rounded-2xl border border-slate-700/60 bg-slate-800/50 p-6">
        <RichContent step={step} size="base" />
      </div>
    </div>
  );

  const MediaCol = (
    <div className="flex items-center">
      <div className="w-full">
        <MediaBlock step={step} />
      </div>
    </div>
  );

  return (
    <SlideShell>
      <div className="grid w-full max-w-6xl grid-cols-1 gap-10 md:grid-cols-2">
        {reverse ? (
          <>
            {MediaCol}
            {TextCol}
          </>
        ) : (
          <>
            {TextCol}
            {MediaCol}
          </>
        )}
      </div>
    </SlideShell>
  );
}

// ─── TEXT-ONLY ───────────────────────────────────────────────────────────────
export function TextOnlySlide({ step }: SlideProps) {
  const imageUrl = step.imageFileId ? getOnboardingImageUrl(step.imageFileId) : null;
  const mediaOnTop = step.mediaPosition === "top";

  const TextContent = (
    <div className="w-full max-w-3xl">
      <div className="mb-5 flex flex-col gap-3">
        <TopBadge />
        <h1 className="text-3xl font-bold leading-tight text-white md:text-4xl">{step.title}</h1>
        {step.subtitle && (
          <p className="text-base text-slate-400">{step.subtitle}</p>
        )}
      </div>
      <div className="rounded-2xl border border-slate-700/60 bg-slate-800/50 p-8">
        <RichContent step={step} size="lg" />
      </div>
    </div>
  );

  const MediaContent = imageUrl ? (
    <div className="w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl">
      <img src={imageUrl} alt={step.title} className="w-full object-cover" />
    </div>
  ) : step.videoUrl ? (
    <div className="w-full max-w-3xl">
      <VideoPlayer videoUrl={step.videoUrl} />
    </div>
  ) : null;

  return (
    <SlideShell>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        {mediaOnTop ? (
          <>
            {MediaContent}
            {TextContent}
          </>
        ) : (
          <>
            {TextContent}
            {MediaContent}
          </>
        )}
      </div>
    </SlideShell>
  );
}

// ─── VIDEO-FOCUS ─────────────────────────────────────────────────────────────
export function VideoFocusSlide({ step }: SlideProps) {
  const mediaOnTop = step.mediaPosition !== "bottom";
  const hasContent = step.description || (step.descriptionJson && (step.descriptionJson as { content?: unknown[] }).content?.length);

  const VideoContent = step.videoUrl ? (
    <VideoPlayer videoUrl={step.videoUrl} />
  ) : (
    <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-slate-800/50">
      <div className="text-center">
        <svg className="mx-auto mb-3 h-14 w-14 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M9 10h6v4H9m0-4H6a2 2 0 00-2 2v0a2 2 0 002 2h3" />
        </svg>
        <p className="text-sm text-slate-500">Adicione uma URL de vídeo no editor</p>
      </div>
    </div>
  );

  const Caption = hasContent ? (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/50 p-6 text-center">
      <RichContent step={step} size="sm" />
    </div>
  ) : null;

  return (
    <SlideShell>
      <div className="w-full max-w-4xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <TopBadge />
          <h1 className="text-3xl font-bold text-white md:text-4xl">{step.title}</h1>
          {step.subtitle && <p className="text-base text-slate-400">{step.subtitle}</p>}
        </div>
        <div className="flex flex-col gap-5">
          {mediaOnTop ? (
            <>
              {VideoContent}
              {Caption}
            </>
          ) : (
            <>
              {Caption}
              {VideoContent}
            </>
          )}
        </div>
      </div>
    </SlideShell>
  );
}

// ─── LIST ─────────────────────────────────────────────────────────────────────
export function ListSlide({ step }: SlideProps) {
  const imageUrl = step.imageFileId ? getOnboardingImageUrl(step.imageFileId) : null;
  const mediaOnTop = step.mediaPosition === "top";

  const ListContent = (
    <div className="w-full max-w-2xl">
      <div className="mb-6 flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
          <svg className="h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <TopBadge />
        <div>
          <h1 className="text-3xl font-bold text-white md:text-4xl">{step.title}</h1>
          {step.subtitle && <p className="mt-2 text-base text-slate-400">{step.subtitle}</p>}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-700/60 bg-slate-800/50 p-7">
        <RichContent step={step} size="base" />
      </div>
    </div>
  );

  const MediaContent = imageUrl ? (
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl">
      <img src={imageUrl} alt={step.title} className="max-h-56 w-full object-cover" />
    </div>
  ) : null;

  return (
    <SlideShell>
      <div className="flex w-full max-w-2xl flex-col gap-6 items-center">
        {mediaOnTop && MediaContent}
        {ListContent}
        {!mediaOnTop && MediaContent}
      </div>
    </SlideShell>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
const LAYOUT_MAP: Record<SlideLayout, (props: SlideProps) => ReactElement> = {
  hero: HeroSlide,
  split: SplitSlide,
  "text-only": TextOnlySlide,
  "video-focus": VideoFocusSlide,
  list: ListSlide,
};

export function SlideRenderer({ step }: SlideProps) {
  const Component = LAYOUT_MAP[step.layout] ?? HeroSlide;
  return <Component step={step} />;
}
