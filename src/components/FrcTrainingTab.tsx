import { useMemo, useState } from "react";
import { useFlightReviewClub } from "../contexts/FlightReviewClubContext";
import type { FlightReviewClubTrainingCourse, FlightReviewClubTrainingLesson } from "../types/schoolRules";
import { FlightReviewClubGate } from "./FlightReviewClubGate";

function embedVimeoUrl(url: string): string {
  const value = url.trim();
  if (!value) return "";
  const iframeMatch = value.match(/src=["']([^"']+)["']/i);
  const src = iframeMatch?.[1] || value;
  const idMatch = src.match(/(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/i);
  if (!idMatch?.[1]) return src;
  return `https://player.vimeo.com/video/${idMatch[1]}`;
}

function pdfViewUrl(url: string): string {
  const value = url.trim();
  if (!value) return "";
  const separator = value.includes("#") ? "&" : "#";
  return `${value}${separator}toolbar=0&navpanes=0`;
}

function visibleCourses(courses: FlightReviewClubTrainingCourse[]): FlightReviewClubTrainingCourse[] {
  return courses
    .filter((course) => course.enabled)
    .map((course) => ({
      ...course,
      lessons: course.lessons.filter((lesson) => lesson.enabled),
    }))
    .filter((course) => course.lessons.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function CourseCover({ course }: { course: FlightReviewClubTrainingCourse }) {
  if (course.coverImageUrl) {
    return <img src={course.coverImageUrl} alt="" className="h-28 w-full object-cover" />;
  }
  return (
    <div className="flex h-28 w-full items-center justify-center bg-slate-950 text-xs font-bold uppercase tracking-[0.2em] text-sky-300/60">
      FRC
    </div>
  );
}

function LessonTypeBadge({ lesson }: { lesson: FlightReviewClubTrainingLesson }) {
  const tone = lesson.kind === "pdf"
    ? "border-red-500/35 bg-red-500/10 text-red-200"
    : "border-sky-500/35 bg-sky-500/10 text-sky-200";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${tone}`}>
      {lesson.kind === "pdf" ? "PDF" : "Vídeo"}
    </span>
  );
}

function FrcTrainingSkeleton() {
  return (
    <section className="space-y-5" aria-label="Carregando treinamentos FRC">
      <div className="rounded-xl border border-sky-500/20 bg-slate-900/60 p-5">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-800" />
        <div className="mt-3 h-7 w-full max-w-md animate-pulse rounded bg-slate-800" />
        <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-slate-800/80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/55">
            <div className="h-28 animate-pulse bg-slate-950" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-800" />
              <div className="h-3 w-full animate-pulse rounded bg-slate-800/80" />
              <div className="flex items-center justify-between gap-3">
                <div className="h-3 w-16 animate-pulse rounded bg-slate-800/80" />
                <div className="h-8 w-20 animate-pulse rounded-lg bg-slate-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LessonModal({
  lesson,
  onClose,
}: {
  lesson: FlightReviewClubTrainingLesson;
  onClose: () => void;
}) {
  const isPdf = lesson.kind === "pdf";
  const src = isPdf ? pdfViewUrl(lesson.pdfUrl) : embedVimeoUrl(lesson.vimeoUrl);

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <LessonTypeBadge lesson={lesson} />
              {lesson.durationLabel ? <span className="text-xs text-slate-500">{lesson.durationLabel}</span> : null}
            </div>
            <h3 className="mt-1 truncate text-base font-black text-white">{lesson.title}</h3>
            {lesson.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-400">{lesson.description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-950 p-2" onContextMenu={(event) => event.preventDefault()}>
          {src ? (
            <iframe
              title={lesson.title}
              src={src}
              sandbox={isPdf ? undefined : "allow-same-origin allow-scripts allow-presentation allow-popups"}
              allow={isPdf ? undefined : "autoplay; fullscreen; picture-in-picture"}
              allowFullScreen={!isPdf}
              className="h-[min(78vh,760px)] w-full rounded-lg border border-slate-800 bg-black"
            />
          ) : (
            <div className="flex h-[360px] items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-sm text-slate-500">
              Conteúdo indisponível.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FrcTrainingTab({ courses, loading = false }: { courses: FlightReviewClubTrainingCourse[]; loading?: boolean }) {
  const { isClubMember } = useFlightReviewClub();
  const publishedCourses = useMemo(() => visibleCourses(courses), [courses]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<FlightReviewClubTrainingLesson | null>(null);
  const [lockedPreviewOpen, setLockedPreviewOpen] = useState(false);
  const activeCourse = publishedCourses.find((course) => course.id === activeCourseId) ?? null;

  function openLesson(lesson: FlightReviewClubTrainingLesson) {
    if (!isClubMember) {
      setLockedPreviewOpen(true);
      return;
    }
    setSelectedLesson(lesson);
  }

  if (loading) {
    return <FrcTrainingSkeleton />;
  }

  if (publishedCourses.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center">
        <p className="text-sm font-semibold text-slate-300">Nenhum treinamento FRC publicado ainda.</p>
        <p className="mt-1 text-xs text-slate-500">Quando a escola liberar cursos e e-books, eles aparecem aqui.</p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-sky-500/20 bg-slate-900/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-300/80">Treinamento FRC</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-white">Cursos e e-books exclusivos</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Materiais reservados aos integrantes do Flight Review Club.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${isClubMember ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"}`}>
            {isClubMember ? "Acesso liberado" : "Preview"}
          </span>
        </div>
      </div>

      {!activeCourse ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {publishedCourses.map((course) => (
            <button
              key={course.id}
              type="button"
              onClick={() => setActiveCourseId(course.id)}
              className="w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900/55 text-left transition hover:border-sky-500/50 hover:bg-slate-900"
            >
              <CourseCover course={course} />
              <div className="p-4">
                <h3 className="line-clamp-2 text-sm font-black text-white">{course.title}</h3>
                {course.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{course.description}</p> : null}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-400">{course.lessons.length} aula(s)</p>
                  <span className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300">
                    Ver aulas
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
          <button
            type="button"
            onClick={() => {
              setActiveCourseId(null);
              setSelectedLesson(null);
            }}
            className="mb-4 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Voltar para cursos
          </button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-white">{activeCourse.title}</h3>
              {activeCourse.description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{activeCourse.description}</p> : null}
            </div>
            {!isClubMember ? <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-400">Conteúdo bloqueado</span> : null}
          </div>
          <div className="mt-4 divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
            {activeCourse.lessons.map((lesson, index) => (
              <button
                key={lesson.id}
                type="button"
                onClick={() => openLesson(lesson)}
                className="flex w-full flex-wrap items-center gap-3 bg-slate-950/25 px-4 py-3 text-left transition hover:bg-slate-800/45 sm:flex-nowrap"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-black text-slate-300">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-slate-100">{lesson.title}</p>
                    <LessonTypeBadge lesson={lesson} />
                    {lesson.durationLabel ? <span className="text-xs text-slate-500">{lesson.durationLabel}</span> : null}
                  </div>
                  {lesson.description ? <p className="mt-1 line-clamp-1 text-xs text-slate-500">{lesson.description}</p> : null}
                </div>
                <span className="ml-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300">
                  {isClubMember ? "Abrir" : "Ver preview"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedLesson ? <LessonModal lesson={selectedLesson} onClose={() => setSelectedLesson(null)} /> : null}
      {lockedPreviewOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={() => setLockedPreviewOpen(false)}>
          <div className="w-full max-w-xl" onClick={(event) => event.stopPropagation()}>
            <FlightReviewClubGate feature="treinamento-frc" />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default FrcTrainingTab;
