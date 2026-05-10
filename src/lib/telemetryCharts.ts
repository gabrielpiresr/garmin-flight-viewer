/** Definição de uma série numérica extraída do CSV (chave estável para Recharts). */
export type TelemetrySeriesDef = {
  key: string;
  label: string;
  /** Padrões testados em `normHeader(nomeDaColuna)`; o primeiro que casar ganha a coluna. */
  patterns: RegExp[];
  color: string;
};

/** Grupo de linhas no mesmo eixo Y (mesma unidade). */
export type TelemetryChartPanel = {
  id: string;
  title: string;
  yUnit: string;
  seriesKeys: string[];
};

export const TELEMETRY_SERIES: TelemetrySeriesDef[] = [
  { key: "gpsAltFt", label: "GPS Alt", patterns: [/^gps\s*altitude/i], color: "#22d3ee" },
  { key: "pressAltFt", label: "Pressão", patterns: [/^pressure\s*altitude/i], color: "#fbbf24" },
  { key: "baroAltFt", label: "Baro", patterns: [/^baro\s*altitude/i], color: "#34d399" },
  { key: "selectedAltFt", label: "Alt sel.", patterns: [/^selected\s*altitude/i], color: "#a78bfa" },
  { key: "vnavAltFt", label: "VNAV alt", patterns: [/^vnav\s*altitude/i], color: "#f472b6" },
  { key: "densityAltFt", label: "Densidade", patterns: [/^density\s*altitude/i], color: "#94a3b8" },
  { key: "heightAglFt", label: "AGL", patterns: [/^height\s*above\s*ground/i], color: "#fb923c" },

  { key: "gsKt", label: "GS GPS", patterns: [/^gps\s*ground\s*speed/i], color: "#a78bfa" },
  { key: "iasKt", label: "IAS", patterns: [/^indicated\s*airspeed/i], color: "#22d3ee" },
  { key: "tasKt", label: "TAS", patterns: [/^true\s*airspeed/i], color: "#34d399" },
  { key: "selectedAsKt", label: "IAS sel.", patterns: [/^selected\s*airspeed/i], color: "#f472b6" },
  { key: "windKt", label: "Vento", patterns: [/^wind\s*speed/i], color: "#64748b" },

  { key: "vertSpeedFpm", label: "VS", patterns: [/^vertical\s*speed/i], color: "#38bdf8" },
  { key: "selectedVsFpm", label: "VS sel.", patterns: [/^selected\s*vertical\s*speed/i], color: "#c084fc" },
  { key: "apVsFpm", label: "AP VS", patterns: [/^ap\s*vs\s*command/i], color: "#fbbf24" },

  { key: "pitchDeg", label: "Pitch", patterns: [/^pitch\s*\(/i, /^pitch$/i], color: "#22d3ee" },
  { key: "rollDeg", label: "Roll", patterns: [/^roll\s*\(/i, /^roll$/i], color: "#a78bfa" },
  { key: "pitchDeltaDeg", label: "Δ pitch", patterns: [/^pitch\s*delta/i], color: "#94a3b8" },
  { key: "rollDeltaDeg", label: "Δ roll", patterns: [/^roll\s*delta/i], color: "#64748b" },

  { key: "latG", label: "Lat G", patterns: [/^lateral\s*acceleration/i], color: "#f87171" },
  { key: "normG", label: "Normal G", patterns: [/^normal\s*acceleration/i], color: "#fbbf24" },

  { key: "hdgMag", label: "Hdg mag", patterns: [/^magnetic\s*heading/i], color: "#22d3ee" },
  { key: "hdgSelDeg", label: "Hdg sel.", patterns: [/^selected\s*heading/i], color: "#a78bfa" },
  { key: "trackDeg", label: "Track GPS", patterns: [/^gps\s*ground\s*track/i], color: "#34d399" },
  { key: "windDirDeg", label: "Vento °", patterns: [/^wind\s*direction/i], color: "#64748b" },

  { key: "navDistNm", label: "Nav DME", patterns: [/^nav\s*distance/i], color: "#22d3ee" },
  { key: "navBrgDeg", label: "Nav QDM", patterns: [/^nav\s*bearing/i], color: "#a78bfa" },
  { key: "navCrsDeg", label: "Nav curso", patterns: [/^nav\s*course/i], color: "#34d399" },
  { key: "navXtkNm", label: "XTK", patterns: [/^nav\s*cross\s*track/i], color: "#f87171" },

  { key: "rpm", label: "RPM", patterns: [/^rpm$/i], color: "#22d3ee" },
  { key: "mapInHg", label: "MAP", patterns: [/^manifold\s*press/i], color: "#fbbf24" },
  { key: "oilPsi", label: "Óleo PSI", patterns: [/^oil\s*press/i], color: "#34d399" },
  { key: "oilTempF", label: "Óleo °F", patterns: [/^oil\s*temp/i], color: "#fb923c" },
  { key: "fuelFlowGph", label: "FF", patterns: [/^fuel\s*flow/i], color: "#a78bfa" },
  { key: "fuelPressPsi", label: "Comb. PSI", patterns: [/^fuel\s*press/i], color: "#f472b6" },
  { key: "fuelL", label: "Comb. L", patterns: [/^fuel\s*qty\s*l/i], color: "#64748b" },
  { key: "fuelR", label: "Comb. R", patterns: [/^fuel\s*qty\s*r/i], color: "#94a3b8" },
  { key: "cht1F", label: "CHT1", patterns: [/^cht1/i], color: "#ef4444" },
  { key: "cht2F", label: "CHT2", patterns: [/^cht2/i], color: "#f97316" },
  { key: "egt1F", label: "EGT1", patterns: [/^egt1/i], color: "#dc2626" },
  { key: "egt2F", label: "EGT2", patterns: [/^egt2/i], color: "#ea580c" },

  { key: "oatC", label: "OAT", patterns: [/^outside\s*air\s*temp/i], color: "#38bdf8" },
  { key: "velEMps", label: "Vel E", patterns: [/^gps\s*velocity\s*e/i], color: "#64748b" },
  { key: "velNMps", label: "Vel N", patterns: [/^gps\s*velocity\s*n/i], color: "#94a3b8" },
  { key: "velUMps", label: "Vel U", patterns: [/^gps\s*velocity\s*u/i], color: "#cbd5e1" },

  { key: "aoa", label: "AOA", patterns: [/^aoa$/i], color: "#22d3ee" },
  { key: "aoaCp", label: "AOA Cp", patterns: [/^aoa\s*cp/i], color: "#0ea5e9" },
  { key: "fdPitchCmd", label: "FD pitch", patterns: [/^fd\s*pitch\s*command/i], color: "#fbbf24" },
  { key: "fdRollCmd", label: "FD roll", patterns: [/^fd\s*roll\s*command/i], color: "#a78bfa" },
  { key: "apPitchCmd", label: "AP pitch", patterns: [/^ap\s*pitch\s*command/i], color: "#34d399" },
  { key: "apRollCmd", label: "AP roll", patterns: [/^ap\s*roll\s*command/i], color: "#f472b6" },
];

export const TELEMETRY_PANELS: TelemetryChartPanel[] = [
  { id: "alt", title: "Altitude", yUnit: "ft", seriesKeys: ["gpsAltFt", "pressAltFt", "baroAltFt", "selectedAltFt", "vnavAltFt", "densityAltFt", "heightAglFt"] },
  { id: "spd", title: "Velocidade", yUnit: "kt", seriesKeys: ["gsKt", "iasKt", "tasKt", "selectedAsKt"] },
  { id: "vs", title: "Velocidade vertical", yUnit: "ft/min", seriesKeys: ["vertSpeedFpm", "selectedVsFpm", "apVsFpm"] },
  { id: "att", title: "Atitude", yUnit: "°", seriesKeys: ["pitchDeg", "rollDeg", "pitchDeltaDeg", "rollDeltaDeg"] },
  { id: "g", title: "Aceleração", yUnit: "G", seriesKeys: ["latG", "normG"] },
  { id: "hdg", title: "Rumo e track", yUnit: "°", seriesKeys: ["hdgMag", "hdgSelDeg", "trackDeg"] },
  { id: "wind", title: "Vento", yUnit: "° / kt", seriesKeys: ["windDirDeg", "windKt"] },
  { id: "navDist", title: "Navegação — distância", yUnit: "nm", seriesKeys: ["navDistNm", "navXtkNm"] },
  { id: "navAng", title: "Navegação — ângulos", yUnit: "°", seriesKeys: ["navBrgDeg", "navCrsDeg"] },
  { id: "eng", title: "Motor — potência / fluxo", yUnit: "rpm · inHg · gph", seriesKeys: ["rpm", "mapInHg", "fuelFlowGph"] },
  { id: "engPress", title: "Motor — óleo / combustível", yUnit: "PSI · °F", seriesKeys: ["oilPsi", "oilTempF", "fuelPressPsi"] },
  { id: "engFuelQty", title: "Combustível (tanques)", yUnit: "gal", seriesKeys: ["fuelL", "fuelR"] },
  { id: "cht", title: "CHT / EGT", yUnit: "°F", seriesKeys: ["cht1F", "cht2F", "egt1F", "egt2F"] },
  { id: "gpsv", title: "Velocidade GPS (E/N/U)", yUnit: "m/s", seriesKeys: ["velEMps", "velNMps", "velUMps"] },
  { id: "fdap", title: "FD / AP (comandos)", yUnit: "°", seriesKeys: ["fdPitchCmd", "fdRollCmd", "apPitchCmd", "apRollCmd"] },
  { id: "misc", title: "Temperatura / AOA", yUnit: "°C", seriesKeys: ["oatC", "aoa", "aoaCp"] },
];

export type ChartRow = { x: number } & Record<string, number | null>;

export function panelHasData(panel: TelemetryChartPanel, data: ChartRow[], resolved: Map<string, string>): boolean {
  const keys = panel.seriesKeys.filter((k) => resolved.has(k));
  if (keys.length === 0) return false;
  return data.some((row) => keys.some((k) => row[k] !== null && row[k] !== undefined));
}

export function labelForKey(key: string): string {
  return TELEMETRY_SERIES.find((s) => s.key === key)?.label ?? key;
}

export function colorForKey(key: string): string {
  return TELEMETRY_SERIES.find((s) => s.key === key)?.color ?? "#94a3b8";
}
