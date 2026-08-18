import type { ReactNode } from "react";

function Sparkline({
  points,
  color = "#38bdf8",
  fill = "rgba(56,189,248,0.16)",
}: {
  points: string;
  color?: string;
  fill?: string;
}) {
  return (
    <svg viewBox="0 0 360 96" className="h-full w-full" aria-hidden="true">
      <path d={`${points} L 360 96 L 0 96 Z`} fill={fill} />
      <path d={points} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function DeviceFrame({
  url,
  children,
  className = "",
}: {
  url: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/40 ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/10 bg-slate-900 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-2 min-w-0 flex-1 truncate rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">{url}</span>
      </div>
      <div className="pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

function MiniSidebar({ active }: { active: string }) {
  const items = ["Jornada", "Meus voos", "Agendamento", "Álbum", "Marketplace"];
  return (
    <aside className="hidden w-36 shrink-0 border-r border-slate-800 bg-slate-950/90 sm:block">
      <div className="border-b border-slate-800 px-3 py-3">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Portal do aluno</p>
        <p className="text-[11px] font-semibold text-slate-200">Operação de voo</p>
      </div>
      <nav className="space-y-1 p-2">
        {items.map((item) => (
          <div
            key={item}
            className={`rounded-lg px-2 py-1.5 text-[11px] ${
              item === active
                ? "border border-emerald-500/30 bg-emerald-500/10 font-semibold text-emerald-200"
                : "text-slate-500"
            }`}
          >
            {item}
          </div>
        ))}
        <div className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-amber-300">Flight Review Club</div>
      </nav>
    </aside>
  );
}

function FrcChip() {
  return (
    <span className="inline-flex items-center rounded-full border border-pink-500/40 bg-pink-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-pink-200">
      FRC
    </span>
  );
}

export function TelemetryMockup() {
  return (
    <div className="bg-slate-950 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Telemetria</p>
          <p className="text-sm font-black text-white">NAV 12 · SBBH → SBSP</p>
        </div>
        <FrcChip />
      </div>
      <div className="mb-3 flex gap-1.5">
        {["Inicial", "Telemetria", "Review", "Vídeos"].map((tab, index) => (
          <span
            key={tab}
            className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
              index === 1 ? "bg-sky-500/15 text-sky-200" : "text-slate-500"
            }`}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[
          ["IAS", "118 kt"],
          ["ALT", "4.500 ft"],
          ["VS", "+120 fpm"],
          ["G", "1.12"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-2">
            <p className="text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-xs font-black text-slate-100">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
          <p className="mb-1 text-[10px] text-slate-400">Altitude (ft)</p>
          <div className="h-16">
            <Sparkline
              points="M 0 78 C 28 78 46 62 58 34 S 92 14 128 16 S 188 22 228 14 S 268 38 308 68 S 336 86 360 88"
              color="#94a3b8"
              fill="rgba(148,163,184,0.12)"
            />
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
          <p className="mb-1 text-[10px] text-slate-400">IAS (kt)</p>
          <div className="h-14">
            <Sparkline points="M 0 70 C 24 68 48 42 72 38 S 128 44 164 28 S 220 18 268 32 S 312 48 360 40" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReviewMockup() {
  const steps = [
    { name: "Decolagem", tone: "ok", note: "Rotação 55 kt · pitch estável" },
    { name: "800 ft AGL", tone: "ok", note: "Checklists e rádio no ponto" },
    { name: "Circuito", tone: "warn", note: "Bank 32° · revisar coordenação" },
    { name: "Final / arredondamento", tone: "ok", note: "Velocidade 62 kt no flare" },
  ];
  return (
    <div className="bg-slate-950 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Flight Review</p>
          <p className="text-sm font-black text-white">Manobras do voo</p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
          3/4 ok
        </span>
      </div>
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div key={step.name} className="rounded-xl border border-slate-800 bg-slate-900/45 p-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                  step.tone === "ok" ? "bg-emerald-400 text-emerald-950" : "bg-amber-300 text-amber-950"
                }`}
              >
                {index + 1}
              </span>
              <p className="text-xs font-bold text-slate-100">{step.name}</p>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">{step.note}</p>
            <div className="mt-1.5 h-8">
              <Sparkline
                points={index === 2
                  ? "M 0 22 C 40 10 80 28 120 8 S 200 30 260 12 S 320 24 360 18"
                  : "M 0 20 C 50 18 90 14 140 16 S 220 12 280 14 S 330 18 360 16"}
                color={step.tone === "ok" ? "#34d399" : "#fbbf24"}
                fill={step.tone === "ok" ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)"}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PublicShareMockup() {
  return (
    <div className="bg-slate-950 p-4">
      <div className="overflow-hidden rounded-3xl border border-sky-400/20 bg-[linear-gradient(135deg,rgba(14,165,233,0.22),rgba(15,23,42,0.96)_42%,rgba(16,185,129,0.18))] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-200/80">Flight Review</p>
        <h3 className="mt-3 text-xl font-black leading-tight text-white">Ana compartilhou um voo com vocês</h3>
        <p className="mt-2 text-xs leading-5 text-slate-300">Voo do dia 12 de agosto de 2026. Veja o vídeo, a telemetria e o Flight Review completo.</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2 text-xs font-black text-slate-950">
          Acessar
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {["Inicial", "Fotos", "Figurinhas"].map((tab) => (
            <span key={tab} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center text-[10px] text-slate-300">
              {tab}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PlanningMockup() {
  return (
    <div className="bg-slate-950 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Planejamento</p>
          <p className="text-sm font-black text-white">SBBH → SBSP · 1h42</p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
          VFR
        </span>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-[#0b1c18]">
        <svg viewBox="0 0 420 220" className="h-44 w-full" aria-hidden="true">
          <defs>
            <linearGradient id="frc-map" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#064e3b" />
              <stop offset="55%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#164e63" />
            </linearGradient>
          </defs>
          <rect width="420" height="220" fill="url(#frc-map)" />
          <path d="M 20 170 C 80 150 90 90 150 80 S 240 110 300 70 S 360 40 400 50" fill="none" stroke="#22d3ee" strokeWidth="3" strokeDasharray="7 6" />
          <circle cx="58" cy="158" r="6" fill="#38bdf8" />
          <circle cx="348" cy="58" r="6" fill="#34d399" />
          <text x="70" y="152" fill="#e2e8f0" fontSize="11" fontWeight="700">SBBH</text>
          <text x="300" y="48" fill="#e2e8f0" fontSize="11" fontWeight="700">SBSP</text>
        </svg>
        <div className="absolute bottom-2 left-2 right-2 grid grid-cols-3 gap-1.5">
          {[
            ["METAR", "09012KT 9999"],
            ["Vento", "12 kt / 090"],
            ["Combustível", "48 L"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
              <p className="text-[10px] font-bold text-slate-100">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScheduleMockup() {
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const slots = [
    ["07:00", null, "locked", null, "frc", null, null],
    ["09:00", "mine", null, "locked", null, "frc", null],
    ["11:00", null, "frc", null, null, "locked", "frc"],
    ["14:00", "locked", null, "mine", null, null, "locked"],
  ] as const;
  return (
    <div className="bg-slate-950 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Agendamento</p>
          <p className="text-sm font-black text-white">Agenda com 30 dias</p>
        </div>
        <FrcChip />
      </div>
      <div className="grid grid-cols-8 gap-1 text-center text-[9px] text-slate-500">
        <span />
        {days.map((day) => (
          <span key={day} className="py-1 font-semibold">{day}</span>
        ))}
        {slots.map((row) =>
          row.map((cell, index) => {
            if (index === 0) {
              return (
                <span key={`${row[0]}-label`} className="py-2 text-left text-slate-500">
                  {cell}
                </span>
              );
            }
            const kind = cell;
            const cls =
              kind === "frc"
                ? "border-sky-400/40 bg-sky-400/15 text-sky-100"
                : kind === "mine"
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                  : kind === "locked"
                    ? "border-slate-800 bg-slate-900/40 text-slate-600"
                    : "border-slate-800 bg-slate-900/20";
            return (
              <span key={`${row[0]}-${index}`} className={`rounded-md border px-1 py-2 text-[8px] font-bold ${cls}`}>
                {kind === "frc" ? "FRC" : kind === "mine" ? "VOCÊ" : kind === "locked" ? "—" : ""}
              </span>
            );
          }),
        )}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">Slots além da janela normal só abrem para integrantes FRC.</p>
    </div>
  );
}

export function JourneyMockup() {
  const missions = [
    { n: "OK", name: "Área 1", status: "done", meta: "50 min · local" },
    { n: "08", name: "NAV 12", status: "next", meta: "90 min · navegação" },
    { n: "09", name: "Noturno", status: "locked", meta: "60 min · local" },
  ];
  return (
    <div className="bg-slate-950 p-3">
      <section className="rounded-2xl border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(6,78,59,0.84),rgba(15,23,42,0.92)_48%,rgba(88,28,135,0.72))] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Formação</p>
        <div className="mt-1 flex items-center gap-2">
          <h3 className="text-lg font-black text-white">PP — Avião</h3>
          <span className="inline-flex items-center rounded-full bg-sky-400/15 px-2 py-0.5 text-[9px] font-bold text-sky-300">
            Flight Review Club
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            ["Próxima", "NAV 12"],
            ["Horas", "42%"],
            ["Missões", "7/18"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.06] p-2">
              <p className="text-[9px] uppercase tracking-widest text-emerald-200/80">{label}</p>
              <p className="text-xs font-black text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {missions.map((mission) => (
          <article
            key={mission.name}
            className={`rounded-2xl border p-2 ${
              mission.status === "done"
                ? "border-emerald-400/40 bg-emerald-500/10"
                : mission.status === "next"
                  ? "border-amber-300/60 bg-amber-400/10"
                  : "border-slate-700/70 bg-slate-950/40"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                  mission.status === "done"
                    ? "bg-emerald-400 text-emerald-950"
                    : mission.status === "next"
                      ? "bg-amber-300 text-amber-950"
                      : "bg-slate-800 text-slate-500"
                }`}
              >
                {mission.n}
              </span>
              <p className="text-[11px] font-black text-slate-100">{mission.name}</p>
            </div>
            <p className="mt-1 text-[9px] text-slate-400">{mission.meta}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function StickersMockup() {
  return (
    <div className="bg-slate-950 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Figurinhas</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[1.6rem] bg-gradient-to-b from-sky-500 to-slate-950 p-3 text-white shadow-lg">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-100/80">epeac</p>
          <p className="mt-4 text-lg font-black leading-none">SBBH</p>
          <p className="text-[10px] text-sky-100/70">para</p>
          <p className="text-lg font-black leading-none">SBSP</p>
          <div className="mt-4 grid grid-cols-2 gap-1 text-[10px]">
            <span>1h42</span>
            <span>142 kt</span>
            <span>5.500 ft</span>
            <span>PR-EAC</span>
          </div>
        </div>
        <div className="rounded-[1.6rem] border border-slate-700 bg-slate-900 p-3">
          <p className="text-[10px] text-slate-400">Altitude</p>
          <div className="h-16">
            <Sparkline
              points="M 0 70 C 30 68 50 40 80 22 S 140 10 180 18 S 240 40 300 70 S 340 84 360 88"
              color="#a78bfa"
              fill="rgba(167,139,250,0.14)"
            />
          </div>
          <p className="mt-2 text-xs font-black text-white">Flyover do voo</p>
          <p className="text-[10px] text-slate-500">Animação pronta para WhatsApp</p>
        </div>
      </div>
    </div>
  );
}

const ALBUM_TILES = [
  { src: "/panels/montaer-glass-full.png", label: "Vídeo · fonia", play: true },
  { src: "/panels/montaer-analog-full.png", label: "Foto", play: false },
  { src: "/panels/montaer-glass-g3x.png", label: "Vídeo", play: true },
  { src: "/panels/montaer-analog-map.png", label: "Foto", play: false },
  { src: "/panels/montaer-glass-ipad.png", label: "Vídeo · fonia", play: true },
  { src: "/panels/montaer-analog-radio.png", label: "Foto", play: false },
];

export function AlbumMockup() {
  return (
    <div className="bg-slate-950 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Álbum</p>
        <p className="text-[10px] text-slate-500">12 de agosto</p>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {ALBUM_TILES.map((tile) => (
          <div key={tile.src} className="relative aspect-square overflow-hidden rounded-md bg-slate-900">
            <img src={tile.src} alt="" className="h-full w-full object-cover" />
            {tile.play ? (
              <span className="absolute inset-0 flex items-center justify-center bg-slate-950/25">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-400 text-[10px] font-black text-slate-950">
                  ▶
                </span>
              </span>
            ) : null}
            <span className="absolute bottom-1 left-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[8px] font-semibold text-slate-200">
              {tile.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketplaceMockup() {
  const products = [
    { name: "Headset ANR", price: "R$ 1.890", frc: "R$ 1.512", off: "−20%", featured: true },
    { name: "Briefing NAV", price: "R$ 180", frc: "R$ 144", off: "−20%", featured: false },
    { name: "Kit kneeboard", price: "R$ 96", frc: "R$ 82", off: "−15%", featured: false },
  ];
  return (
    <div className="bg-slate-950 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Marketplace</p>
        <FrcChip />
      </div>
      <div className="mb-2 flex gap-1.5">
        {["Todos", "Equipamento", "Serviço"].map((chip, index) => (
          <span
            key={chip}
            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
              index === 0 ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-slate-700 text-slate-500"
            }`}
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {products.map((product) => (
          <article key={product.name} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/50">
            <div className="relative aspect-[4/3] bg-gradient-to-br from-slate-700 to-slate-900">
              {product.featured ? (
                <span className="absolute right-1 top-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[8px] font-bold uppercase text-slate-950">
                  Destaque
                </span>
              ) : null}
            </div>
            <div className="p-2">
              <p className="text-[10px] font-semibold text-slate-100">{product.name}</p>
              <p className="text-[9px] text-slate-500 line-through">{product.price}</p>
              <p className="text-[11px] font-bold text-amber-300">{product.frc}</p>
              <p className="text-[9px] font-semibold text-amber-200">{product.off} FRC</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function SchoolKitMockup() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-slate-950 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Camiseta</p>
        <div className="mt-3 flex items-center justify-center">
          <div className="relative h-28 w-24">
            <div className="absolute inset-x-5 top-0 h-4 rounded-t-md bg-slate-700" />
            <div className="absolute left-0 top-3 h-20 w-24 rounded-b-xl bg-sky-300" />
            <div className="absolute left-1/2 top-8 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-slate-900/20 text-[10px] font-black text-slate-950">
              FRC
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">Camiseta da escola na 1ª assinatura</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-950 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Crachá</p>
        <div className="mx-auto mt-3 w-28 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-lg">
          <div className="h-8 bg-sky-400" />
          <div className="p-2 text-center">
            <div className="mx-auto h-10 w-10 rounded-full bg-slate-700" />
            <p className="mt-1 text-[11px] font-black text-white">ANA LIMA</p>
            <p className="text-[9px] text-slate-500">Aluna PP</p>
            <div className="mt-1 flex justify-center"><FrcChip /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CourseWebinarMockup() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-slate-950 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Curso EAD</p>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-400 text-sm font-black text-slate-950">▶</span>
          </div>
          <div className="p-2">
            <p className="text-xs font-black text-white">Segurança de Voo</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-2/5 rounded-full bg-sky-400" />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">Módulo 2 de 5</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-950 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Webinar</p>
        <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-black uppercase text-white">Ao vivo</span>
          <p className="mt-2 text-sm font-black text-white">CRM na instrução</p>
          <p className="mt-1 text-[11px] text-slate-300">Toda última quinta · 19h</p>
          <p className="mt-3 text-[10px] font-semibold text-amber-200">Exclusivo para integrantes</p>
        </div>
      </div>
    </div>
  );
}

export function PartnersMockup() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-slate-950 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">NexAtlas</p>
        <div className="mt-2 overflow-hidden rounded-xl border border-cyan-500/20 bg-[#042f2e]">
          <svg viewBox="0 0 280 120" className="h-24 w-full" aria-hidden="true">
            <rect width="280" height="120" fill="#02343a" />
            <path d="M 10 90 C 50 40 90 70 140 35 S 220 20 270 55" fill="none" stroke="#22d3ee" strokeWidth="2" />
            <circle cx="70" cy="62" r="4" fill="#fbbf24" />
            <circle cx="180" cy="32" r="4" fill="#34d399" />
            <text x="16" y="18" fill="#67e8f9" fontSize="10" fontWeight="700">NEXATLAS</text>
          </svg>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Acesso gratuito liberado pela escola</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-950 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">Clube 360</p>
        <div className="mt-2 rounded-xl border border-violet-400/20 bg-gradient-to-br from-violet-950 to-slate-950 p-3">
          <p className="text-lg font-black text-white">360°</p>
          <p className="mt-1 text-[11px] leading-5 text-violet-100/80">Comunidade, conteúdos e benefícios da parceria da escola.</p>
          <span className="mt-3 inline-flex rounded-lg bg-violet-400/20 px-2 py-1 text-[10px] font-bold text-violet-100">
            Incluso no FRC
          </span>
        </div>
      </div>
    </div>
  );
}

export function TrainingMockup() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-400 text-sm font-black text-slate-950">▶</span>
        </div>
        <div className="p-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-sky-300">Vídeo</p>
          <p className="mt-1 text-xs font-black text-white">Aulas em vídeo</p>
          <p className="mt-1 text-[10px] text-slate-500">Cursos exclusivos FRC</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-rose-950 to-slate-950">
          <span className="rounded-md border border-red-400/40 bg-red-500/15 px-2 py-1 text-[10px] font-black uppercase text-red-200">PDF</span>
        </div>
        <div className="p-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-red-300">E-book</p>
          <p className="mt-1 text-xs font-black text-white">Materiais em PDF</p>
          <p className="mt-1 text-[10px] text-slate-500">Para revisar em terra</p>
        </div>
      </div>
    </div>
  );
}

export function HeroPortalMockup() {
  return (
    <DeviceFrame url="epeac.app / jornada / NAV 12">
      <div className="flex min-h-[22rem] bg-slate-950">
        <MiniSidebar active="Meus voos" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[11px] font-semibold text-slate-200">Flight Review · NAV 12</p>
            <FrcChip />
          </div>
          <TelemetryMockup />
        </div>
      </div>
    </DeviceFrame>
  );
}
