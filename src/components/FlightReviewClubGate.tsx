import type { ReactNode } from "react";
import { useFlightReviewClub } from "../contexts/FlightReviewClubContext";

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path
        fillRule="evenodd"
        d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function FlightReviewClubGate({ children }: { children?: ReactNode }) {
  const { lpUrl } = useFlightReviewClub();

  const lockBody = (
    <>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
        <LockIcon />
      </div>
      <div>
        <h3 className="text-base font-black text-white">Disponível no Flight Review Club</h3>
        <p className="mt-1 text-sm text-slate-400">
          Acesse análises detalhadas, vídeos e telemetria completos dos seus voos.
        </p>
      </div>
      <a
        href={lpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-sky-300"
      >
        Conhecer o Flight Review Club
      </a>
    </>
  );

  if (!children) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-xl border border-slate-800/60 bg-slate-950/60 px-6 py-10 text-center">
        {lockBody}
      </div>
    );
  }

  return (
    <div className="relative min-h-[280px]">
      <div aria-hidden="true" className="pointer-events-none select-none opacity-30 blur-sm">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl bg-slate-950/85 px-6 py-10 text-center">
        {lockBody}
      </div>
    </div>
  );
}
