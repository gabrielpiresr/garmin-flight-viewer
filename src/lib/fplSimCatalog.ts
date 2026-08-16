import type { FplItem19, FplPlanForm } from "../types/fplSim";

export type FplToggleItem = {
  code: string;
  label: string;
  exclusiveGroup?: string;
};

export type FplToggleSection = {
  title: string;
  items: FplToggleItem[];
};

export const FPL_FLIGHT_RULES = [
  { code: "I", label: "IFR" },
  { code: "V", label: "VFR" },
  { code: "Y", label: "IFR → VFR" },
  { code: "Z", label: "VFR → IFR" },
] as const;

export const FPL_FLIGHT_TYPES = [
  { code: "S", label: "Regular" },
  { code: "N", label: "Não regular" },
  { code: "G", label: "Aviação geral" },
  { code: "M", label: "Militar" },
  { code: "X", label: "Outro" },
] as const;

export const FPL_WAKE = [
  { code: "L", label: "Leve" },
  { code: "M", label: "Média" },
  { code: "H", label: "Pesada" },
  { code: "J", label: "Super" },
] as const;

export const FPL_10A_SECTIONS: FplToggleSection[] = [
  {
    title: "EQUIPAMENTOS E CAPACIDADES DE RADIOCOMUNICAÇÕES, DE AUXÍLIOS, À NAVEGAÇÃO E À APROXIMAÇÃO",
    items: [
      { code: "N", label: "Sem equipamentos", exclusiveGroup: "none10a" },
      { code: "S", label: "Equipamentos padrão" },
      { code: "A", label: "Sistema de pouso GBAS" },
      { code: "B", label: "LPV (APV com SBAS)" },
      { code: "C", label: "LORAN C" },
      { code: "D", label: "DME" },
      { code: "E1", label: "FMC WPR ACARS" },
      { code: "E2", label: "D-FIS ACARS" },
      { code: "E3", label: "PDC ACARS" },
      { code: "F", label: "ADF" },
      { code: "G", label: "GNSS" },
      { code: "H", label: "HF RTF" },
      { code: "I", label: "Navegação Inercial" },
      { code: "J1", label: "CPDLC ATN VDL Modo 2" },
      { code: "J2", label: "CPDLC FANS 1/A HFDL" },
      { code: "J3", label: "CPDLC FANS 1/A VDL Modo A" },
      { code: "J4", label: "CPDLC FANS 1/A VDL Modo 2" },
      { code: "J5", label: "CPDLC FANS 1/A SATCOM (INMARSAT)" },
      { code: "J6", label: "CPDLC FANS 1/A SATCOM (MTSAT)" },
      { code: "J7", label: "CPDLC FANS 1/A SATCOM (Iridium)" },
      { code: "K", label: "MLS" },
      { code: "L", label: "ILS" },
      { code: "M1", label: "ATC SATVOICE (INMARSAT)" },
      { code: "M2", label: "ATC SATVOICE (MTSAT)" },
      { code: "M3", label: "ATC SATVOICE (Iridium)" },
      { code: "O", label: "VOR" },
      { code: "P1", label: "CPDLC RCP 400" },
      { code: "P2", label: "CPDLC RCP 240" },
      { code: "P3", label: "SATVOICE RCP 400" },
      { code: "R", label: "Aprovado PBN" },
      { code: "T", label: "TACAN" },
      { code: "U", label: "UHF RTF" },
      { code: "V", label: "VHF RTF" },
      { code: "W", label: "Aprovado RVSM" },
      { code: "X", label: "Aprovado MNPS" },
      { code: "Y", label: "VHF com capacidade de 8,33 kHz" },
      { code: "Z", label: "Outro equipamento ou capacidade" },
    ],
  },
];

export const FPL_10B_SECTIONS: FplToggleSection[] = [
  {
    title: "EQUIPAMENTOS E CAPACIDADES DE VIGILÂNCIA",
    items: [{ code: "N", label: "Sem equipamentos", exclusiveGroup: "none10b" }],
  },
  {
    title: "SSR MODOS A E C",
    items: [
      { code: "A", label: "Transponder Modo A (4 dígitos - 4096)", exclusiveGroup: "ssrAC" },
      { code: "C", label: "Transponder Modo A (4 dígitos - 4096) e Modo C", exclusiveGroup: "ssrAC" },
    ],
  },
  {
    title: "ADS-C",
    items: [
      { code: "D1", label: "ADS-C com capacidades FANS 1/A" },
      { code: "G1", label: "ADS-C com capacidades ATN" },
    ],
  },
  {
    title: "SSR MODO S",
    items: [
      {
        code: "E",
        label:
          "Transponder Modo S, compreendendo a identificação da aeronave, a altitude de pressão e a capacidade dos sinais espontâneos ampliados (ADS-B)",
        exclusiveGroup: "modeS",
      },
      {
        code: "H",
        label:
          "Transponder Modo S, compreendendo a identificação da aeronave, a altitude de pressão e a capacidade de vigilância melhorada",
        exclusiveGroup: "modeS",
      },
      {
        code: "I",
        label: "Transponder Modo S, com a identificação da ACFT, porém sem a capacidade de altitude de pressão",
        exclusiveGroup: "modeS",
      },
      {
        code: "L",
        label:
          "Transponder Modo S, compreendendo a identificação da aeronave, a altitude de pressão, a capacidade dos sinais espontâneos ampliados (ADS-B) e a capacidade de vigilância melhorada",
        exclusiveGroup: "modeS",
      },
      {
        code: "P",
        label: "Transponder Modo S, com a altitude de pressão, porém sem a capacidade de identificação da ACFT",
        exclusiveGroup: "modeS",
      },
      {
        code: "S",
        label: "Transponder Modo S, com a altitude de pressão e a capacidade de identificação da ACFT",
        exclusiveGroup: "modeS",
      },
      {
        code: "X",
        label: "Transponder Modo S, sem a identificação da ACFT e sem capacidade de altitude de pressão",
        exclusiveGroup: "modeS",
      },
    ],
  },
  {
    title: "ADS-B",
    items: [
      { code: "B1", label: "ADS-B com capacidade especializada ADS-B out de 1090 mHz" },
      { code: "B2", label: "ADS-B com capacidade especializada ADS-B out e in de 1090 mHz" },
      { code: "U1", label: "Capacidade ADS-B out usando UAT" },
      { code: "U2", label: "Capacidade ADS-B out e in usando UAT" },
      { code: "V1", label: "Capacidade ADS-B out usando VDL, em modo 4" },
      { code: "V2", label: "Capacidade ADS-B out e in usando VDL, em modo 4" },
    ],
  },
];

export const FPL_ITEM18_TAGS = [
  { key: "STS", label: "STS/" },
  { key: "PBN", label: "PBN/" },
  { key: "NAV", label: "NAV/" },
  { key: "COM", label: "COM/" },
  { key: "DAT", label: "DAT/" },
  { key: "SUR", label: "SUR/" },
  { key: "DEP", label: "DEP/" },
  { key: "DEST", label: "DEST/" },
  { key: "REG", label: "REG/" },
  { key: "EET", label: "EET/" },
  { key: "SEL", label: "SEL/" },
  { key: "TYP", label: "TYP/" },
  { key: "CODE", label: "CODE/" },
  { key: "DLE", label: "DLE/" },
  { key: "OPR", label: "OPR/" },
  { key: "ORGN", label: "ORGN/" },
  { key: "PER", label: "PER/" },
  { key: "ALTN", label: "ALTN/" },
  { key: "RALT", label: "RALT/" },
  { key: "TALT", label: "TALT/" },
  { key: "RIF", label: "RIF/" },
  { key: "RMK", label: "RMK/" },
  { key: "FROM", label: "FROM/" },
] as const;

export const FPL_PER_CODES = ["A", "B", "C", "D", "E", "H"] as const;

export const FPL_STS_CODES = [
  "ALTRV",
  "ATFMX",
  "FFR",
  "FLTCK",
  "HAZMAT",
  "HEAD",
  "HOSP",
  "HUM",
  "MARSA",
  "MEDEVAC",
  "NONRVSM",
  "SAR",
  "STATE",
] as const;

export type FplFieldMeta = {
  id: string;
  label: string;
  group: string;
};

export const FPL_PROTIP_FIELDS: FplFieldMeta[] = [
  { id: "kind", label: "PVS ou PVC", group: "Tipo" },
  { id: "aircraftId", label: "Identificação da aeronave", group: "Campo 7" },
  { id: "callsign", label: "Indicativo de chamada", group: "Campo 7" },
  { id: "flightRules", label: "Regras de voo", group: "Campo 8" },
  { id: "flightType", label: "Tipo de voo", group: "Campo 8" },
  { id: "number", label: "Número de aeronaves", group: "Campo 9" },
  { id: "aircraftType", label: "Tipo de aeronave", group: "Campo 9" },
  { id: "wake", label: "Categoria da esteira", group: "Campo 9" },
  { id: "eq10a", label: "Campo 10 A — COM/NAV", group: "Campo 10" },
  { id: "eq10b", label: "Campo 10 B — Vigilância", group: "Campo 10" },
  { id: "depAd", label: "Aeródromo de partida", group: "Campo 13" },
  { id: "depTime", label: "Hora (EOBT)", group: "Campo 13" },
  { id: "destAd", label: "Aeródromo de destino", group: "Campo 16" },
  { id: "eet", label: "EET total", group: "Campo 16" },
  { id: "altn", label: "Aeródromo alternativo", group: "Campo 16" },
  { id: "altn2", label: "2º aeródromo alternativo", group: "Campo 16" },
  { id: "cruiseSpeed", label: "Velocidade de cruzeiro", group: "Campo 15" },
  { id: "level", label: "Nível", group: "Campo 15" },
  { id: "route", label: "Rota", group: "Campo 15" },
  { id: "dof", label: "DOF/", group: "Campo 18" },
  { id: "item18", label: "Outras informações", group: "Campo 18" },
  { id: "STS", label: "STS/", group: "Campo 18" },
  { id: "PBN", label: "PBN/", group: "Campo 18" },
  { id: "NAV", label: "NAV/", group: "Campo 18" },
  { id: "COM", label: "COM/", group: "Campo 18" },
  { id: "DAT", label: "DAT/", group: "Campo 18" },
  { id: "SUR", label: "SUR/", group: "Campo 18" },
  { id: "DEP", label: "DEP/", group: "Campo 18" },
  { id: "DEST", label: "DEST/", group: "Campo 18" },
  { id: "REG", label: "REG/", group: "Campo 18" },
  { id: "EET", label: "EET/", group: "Campo 18" },
  { id: "SEL", label: "SEL/", group: "Campo 18" },
  { id: "TYP", label: "TYP/", group: "Campo 18" },
  { id: "CODE", label: "CODE/", group: "Campo 18" },
  { id: "DLE", label: "DLE/", group: "Campo 18" },
  { id: "OPR", label: "OPR/", group: "Campo 18" },
  { id: "ORGN", label: "ORGN/", group: "Campo 18" },
  { id: "PER", label: "PER/", group: "Campo 18" },
  { id: "ALTN", label: "ALTN/", group: "Campo 18" },
  { id: "RALT", label: "RALT/", group: "Campo 18" },
  { id: "TALT", label: "TALT/", group: "Campo 18" },
  { id: "RIF", label: "RIF/", group: "Campo 18" },
  { id: "RMK", label: "RMK/", group: "Campo 18" },
  { id: "FROM", label: "FROM/", group: "Campo 18" },
  { id: "endurance", label: "Autonomia", group: "Campo 19" },
  { id: "personsOnBoard", label: "Pessoas a bordo", group: "Campo 19" },
  { id: "emergencyRadio", label: "Rádio de emergência", group: "Campo 19" },
  { id: "survival", label: "Equipamento de sobrevivência", group: "Campo 19" },
  { id: "jackets", label: "Coletes", group: "Campo 19" },
  { id: "dinghies", label: "Botes", group: "Campo 19" },
  { id: "aircraftColor", label: "Cor e marca da ANV", group: "Campo 19" },
  { id: "picName", label: "Piloto em comando", group: "Campo 19" },
  { id: "anac1", label: "Cód. ANAC 1º piloto", group: "Campo 19" },
  { id: "anac2", label: "Cód. ANAC 2º piloto", group: "Campo 19" },
  { id: "phone", label: "Telefone", group: "Campo 19" },
];

export function todayDof(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export function emptyItem19(): FplItem19 {
  return {
    endurance: "",
    personsOnBoard: "",
    radioU: false,
    radioV: false,
    radioE: false,
    survivalS: false,
    survivalP: false,
    survivalD: false,
    survivalM: false,
    survivalJ: false,
    jacketJ: false,
    jacketL: false,
    jacketF: false,
    jacketU: false,
    jacketV: false,
    dinghyD: false,
    dinghyNumber: "",
    dinghyCapacity: "",
    dinghyCover: false,
    dinghyColor: "",
    aircraftColor: "",
    remarks: "",
    picName: "",
    anac1: "",
    anac2: "",
    phone: "",
  };
}

export function emptyFplForm(kind: FplPlanForm["kind"] = "pvs"): FplPlanForm {
  return {
    kind,
    aircraftId: "",
    callsignEnabled: false,
    callsign: "",
    flightRules: "",
    flightType: "",
    number: "",
    aircraftType: "",
    wake: "",
    eq10a: [],
    eq10b: [],
    depAd: "",
    depTime: "",
    destAd: "",
    eet: "",
    altn: "",
    altn2: "",
    cruiseSpeed: "",
    level: "",
    route: "",
    dof: todayDof(),
    item18Keys: [],
    item18: {},
    item19: emptyItem19(),
  };
}

export function toggleExclusiveCode(
  selected: string[],
  code: string,
  allItems: FplToggleItem[],
): string[] {
  const item = allItems.find((entry) => entry.code === code);
  const turningOn = !selected.includes(code);
  if (!turningOn) return selected.filter((value) => value !== code);

  let next = [...selected, code];
  if (item?.exclusiveGroup === "none10a" || item?.exclusiveGroup === "none10b") {
    return [code];
  }
  next = next.filter((value) => value !== "N");
  if (item?.exclusiveGroup) {
    const rivals = allItems
      .filter((entry) => entry.exclusiveGroup === item.exclusiveGroup && entry.code !== code)
      .map((entry) => entry.code);
    next = next.filter((value) => !rivals.includes(value));
  }
  return Array.from(new Set(next));
}

export function all10aItems(): FplToggleItem[] {
  return FPL_10A_SECTIONS.flatMap((section) => section.items);
}

export function all10bItems(): FplToggleItem[] {
  return FPL_10B_SECTIONS.flatMap((section) => section.items);
}

export function formatEq10(codes: string[]): string {
  if (codes.length === 0) return "";
  const order = [...all10aItems(), ...all10bItems()].map((item) => item.code);
  return [...codes].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join("");
}

export function digitsTime(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function displayTime(value: string): string {
  const digits = digitsTime(value);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function icaoOrZzzz(value: string): string {
  return value.trim().toUpperCase();
}
