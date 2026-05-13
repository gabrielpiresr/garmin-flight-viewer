import type { FlightSegment, LandingMetrics, TakeoffMetrics } from "../types/flight";

type Props = { segment: FlightSegment };

export function SegmentSummary({ segment }: Props) {
  if (segment.type === "takeoff") {
    return <TakeoffSummary metrics={segment.takeoffMetrics} />;
  }
  if (segment.type === "landing") {
    return <LandingSummary metrics={segment.landingMetrics} />;
  }
  // TGL starts with the touchdown, then the go-around takeoff.
  return (
    <div className="grid gap-4">
      <LandingSummary metrics={segment.landingMetrics} />
      <TakeoffSummary metrics={segment.takeoffMetrics} />
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 0, suffix = ""): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(decimals)}${suffix}`;
}

function fmtFt(v: number | null | undefined): string {
  return fmt(v, 0, "'");
}

function fmtMFromFt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 0.3048).toFixed(0)} m`;
}

function fmtFtAndM(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${fmtFt(v)} (${fmtMFromFt(v)})`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-500 first:mt-0">
      {children}
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-800 py-1.5 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-100">{children}</span>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4">{children}</div>;
}

function Val({
  value,
  warn,
  danger,
}: {
  value: string;
  warn?: boolean;
  danger?: boolean;
}) {
  const cls = danger
    ? "text-red-400"
    : warn
      ? "text-amber-400"
      : "text-slate-100";
  return <span className={`text-sm font-medium ${cls}`}>{value}</span>;
}

// ─── Takeoff ─────────────────────────────────────────────────────────────────

function TakeoffSummary({ metrics }: { metrics?: TakeoffMetrics }) {
  const m = metrics;
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
      <h4 className="text-sm font-semibold text-slate-200">Decolagem</h4>

      <SectionTitle>Performance</SectionTitle>
      <Row label="Ground roll">
        <Val value={fmtFtAndM(m?.groundRollFt)} />
      </Row>

      <SectionTitle>Liftoff</SectionTitle>
      <Grid2>
        <Row label="Rotation">
          <Val value={`${fmt(m?.rotationIasKt, 0)} KIAS`} />
        </Row>
        <Row label="Pitch rate">
          <Val value={`Max ${fmt(m?.rotationPitchRateDs, 1)}°/s`} />
        </Row>
        <Row label="Liftoff">
          <Val value={`${fmt(m?.liftoffIasKt, 0)} KIAS`} />
        </Row>
        <Row label="Fuel flow">
          <Val value={`${fmt(m?.fuelFlowAtLiftoff, 1)} usg/h`} />
        </Row>
        <Row label="RPM">
          <Val value={`${fmt(m?.rpmAtLiftoff, 0)} rpm`} />
        </Row>
        <Row label="MAP">
          <Val value={`${fmt(m?.mapAtLiftoff, 1)}"`} />
        </Row>
      </Grid2>

      <SectionTitle>A 50 ft</SectionTitle>
      <Grid2>
        <Row label="Distância">
          <Val value={fmtFt(m?.at50DistFromRotFt)} />
        </Row>
        <Row label="IAS">
          <Val value={`${fmt(m?.at50IasKt, 0)} kts`} />
        </Row>
        <Row label="Pitch">
          <Val value={`${fmt(m?.at50PitchDeg, 1)}°`} />
        </Row>
        <Row label="V/speed">
          <Val value={`${fmt(m?.at50VspdFpm, 0)} fpm`} />
        </Row>
      </Grid2>
    </div>
  );
}

// ─── Landing ─────────────────────────────────────────────────────────────────

function LandingSummary({ metrics }: { metrics?: LandingMetrics }) {
  const m = metrics;

  const impactWarn = m?.tdImpactLabel === "Medium";
  const impactDanger = m?.tdImpactLabel === "High";
  const descentWarn = m?.descentPathDeg !== null && m?.descentPathDeg !== undefined && m.descentPathDeg > 5;
  const vsWarn =
    m?.maxDescentRateFpm !== null &&
    m?.maxDescentRateFpm !== undefined &&
    m.maxDescentRateFpm < -1000;

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
      <h4 className="text-sm font-semibold text-slate-200">Pouso</h4>

      <SectionTitle>Aproximação</SectionTitle>
      <Grid2>
        <Row label="Trajetória">
          <Val
            value={`${fmt(m?.descentPathDeg, 1)}° / ${fmtFt(m?.descentPathAltFt)}`}
            warn={descentWarn}
          />
        </Row>
        <Row label="IAS">
          <Val value={`${fmt(m?.iasMinKt, 0)}-${fmt(m?.iasMaxKt, 0)} kts`} />
        </Row>
        <Row label="V/speed máx">
          <Val
            value={`${fmt(m?.maxDescentRateFpm, 0)} fpm`}
            warn={vsWarn}
          />
        </Row>
        <Row label="RPM">
          <Val value={`${fmt(m?.rpmMin, 0)}-${fmt(m?.rpmMax, 0)} rpm`} />
        </Row>
      </Grid2>

      <SectionTitle>A 50 ft</SectionTitle>
      <Grid2>
        <Row label="IAS">
          <Val value={`${fmt(m?.at50IasKt, 0)} kts`} />
        </Row>
        <Row label="Pitch">
          <Val value={`${fmt(m?.at50PitchDeg, 1)}°`} />
        </Row>
      </Grid2>

      <SectionTitle>Arredondagem</SectionTitle>
      <Grid2>
        <Row label="Duração">
          <Val value={`${fmt(m?.flareDurationSec, 0)} s / ${fmtFt(m?.flareDistFt)}`} />
        </Row>
        <Row label="Oscil. pitch">
          <Val value={`${fmt(m?.pitchOscillations, 0)} de 10`} />
        </Row>
      </Grid2>

      <SectionTitle>Toque</SectionTitle>
      <Grid2>
        <Row label="IAS">
          <Val value={`${fmt(m?.tdIasKt, 0)} kts`} />
        </Row>
        <Row label="GS">
          <Val value={`${fmt(m?.tdGsKt, 0)} kts`} />
        </Row>
        <Row label="Crab">
          <Val value={`${fmt(m?.tdCrabAngleDeg, 0)}°`} />
        </Row>
        <Row label="Pitch">
          <Val value={`${fmt(m?.tdPitchDeg, 1)}°`} />
        </Row>
        <Row label="Impacto">
          <Val
            value={m?.tdImpactLabel ?? "—"}
            warn={impactWarn}
            danger={impactDanger}
          />
        </Row>
      </Grid2>

      <SectionTitle>Performance de pouso</SectionTitle>
      <Grid2>
        <Row label="LDA">
          <Val
            value={
              m?.ldaFt !== null && m?.ldaFt !== undefined
                ? fmtFtAndM(m.ldaFt)
                : `${fmt(m?.tdIasKt, 0)} kts`
            }
          />
        </Row>
        <Row label="Velocidade de toque">
          <Val value={`${fmt(m?.tdIasKt, 0)} kts`} />
        </Row>
      </Grid2>
    </div>
  );
}
