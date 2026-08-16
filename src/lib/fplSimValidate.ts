import type { FplPlanForm, FplValidationIssue } from "../types/fplSim";
import { digitsTime } from "./fplSimCatalog";

const ICAO_OR_ZZZZ = /^([A-Z]{4}|ZZZZ)$/;
const ACFT_ID = /^[A-Z0-9]{2,7}$/;
const TYPE = /^[A-Z0-9]{2,4}$/;
const SPEED = /^(K\d{4}|N\d{4}|M\d{3})$/;
const LEVEL = /^(F\d{3}|A\d{3}|S\d{4}|M\d{4}|VFR)$/;
const DOF = /^\d{6}$/;
const HHMM = /^([01]\d|2[0-3])[0-5]\d$/;
const PBN = /^(A1|B[1-6]|C[1-4]|D[1-4]|L1|O[1-4]|S[12]|T[12])+$/;

function issue(
  fieldId: string,
  message: string,
  mcaRef: string,
  severity: FplValidationIssue["severity"] = "error",
): FplValidationIssue {
  return { fieldId, message, mcaRef, severity };
}

function has18(form: FplPlanForm, key: string): boolean {
  return form.item18Keys.includes(key) && Boolean(form.item18[key]?.trim());
}

function timeOk(value: string): boolean {
  return HHMM.test(digitsTime(value));
}

export function validateFplForm(form: FplPlanForm): FplValidationIssue[] {
  const errors: FplValidationIssue[] = [];
  const id = form.aircraftId.trim().toUpperCase().replace(/[-\s]/g, "");
  if (!ACFT_ID.test(id)) {
    errors.push(issue("aircraftId", "Identificação deve ter 2 a 7 caracteres alfanuméricos, sem hífen.", "2.2.1"));
  }
  if (form.callsignEnabled) {
    if (form.callsign.trim().length < 3) {
      errors.push(issue("callsign", "Informe o indicativo de chamada longo.", "2.2.1 NOTA"));
    }
    if (!has18(form, "RMK") || !/INDICATIVO/i.test(form.item18.RMK ?? "")) {
      errors.push(
        issue("RMK", "Indicativo com mais de 7 caracteres exige RMK/INDICATIVO DE CHAMADA … no Campo 18.", "2.2.8.1.21 f"),
      );
    }
  }
  if (!["I", "V", "Y", "Z"].includes(form.flightRules)) {
    errors.push(issue("flightRules", "Selecione I, V, Y ou Z.", "2.2.2.1"));
  }
  if (form.kind === "pvs" && form.flightRules && form.flightRules !== "V") {
    errors.push(
      issue(
        "flightRules",
        "PVS destina-se a voo VFR local. IFR ou mudança de regra pede PVC.",
        "3.1 / ICA 100-11",
        "warning",
      ),
    );
  }
  if (!["S", "N", "G", "M", "X"].includes(form.flightType)) {
    errors.push(issue("flightType", "Selecione o tipo de voo (S, N, G, M ou X).", "2.2.2.2"));
  }
  if (form.number && !/^\d{1,2}$/.test(form.number.trim())) {
    errors.push(issue("number", "Número de aeronaves: 1 ou 2 dígitos, só em formação.", "2.2.3.1"));
  }
  const acType = form.aircraftType.trim().toUpperCase();
  if (!TYPE.test(acType)) {
    errors.push(issue("aircraftType", "Tipo OACI de 2 a 4 caracteres, ou ZZZZ.", "2.2.3.2"));
  }
  if (acType === "ZZZZ" && !has18(form, "TYP")) {
    errors.push(issue("TYP", "ZZZZ no Campo 9 exige TYP/ no Campo 18.", "2.2.3.2 NOTA"));
  }
  if (!["L", "M", "H", "J"].includes(form.wake)) {
    errors.push(issue("wake", "Selecione a esteira L, M, H ou J.", "2.2.3.3"));
  }

  if (form.eq10a.length === 0) {
    errors.push(issue("eq10a", "Informe o Campo 10 A (N, S e/ou letras de equipamento).", "2.2.4.2"));
  }
  if (form.eq10a.includes("N") && form.eq10a.length > 1) {
    errors.push(issue("eq10a", "N (sem equipamentos) não pode ser combinado com outras letras.", "2.2.4.2.1"));
  }
  if (form.eq10a.includes("R") && !has18(form, "PBN")) {
    errors.push(issue("PBN", "Letra R no Campo 10 A exige PBN/ no Campo 18.", "2.2.4.2.6"));
  }
  if (form.eq10a.includes("Z") && !(has18(form, "COM") || has18(form, "NAV") || has18(form, "DAT"))) {
    errors.push(issue("item18", "Letra Z no Campo 10 A exige COM/, NAV/ e/ou DAT/ no Campo 18.", "2.2.4.2.3"));
  }
  if (form.eq10a.includes("G") && form.eq10a.includes("Z") === false) {
    /* G may optionally have NAV/ for SBAS/GBAS — warning only if empty NAV when G */
  }
  if (form.eq10a.includes("G") && !has18(form, "NAV")) {
    errors.push(
      issue("NAV", "Com G (GNSS), indique aumentação externa em NAV/ se houver (ex.: GBAS, SBAS).", "2.2.4.2.4", "warning"),
    );
  }

  if (form.eq10b.length === 0) {
    errors.push(issue("eq10b", "Informe o Campo 10 B (N ou equipamentos de vigilância).", "2.2.4.3"));
  }
  if (form.eq10b.includes("N") && form.eq10b.length > 1) {
    errors.push(issue("eq10b", "N (sem vigilância) não pode ser combinado com outros códigos.", "2.2.4.3.1.2"));
  }
  if (form.eq10b.includes("A") && form.eq10b.includes("C")) {
    errors.push(issue("eq10b", "Use A ou C, não os dois (C já inclui Modo A).", "2.2.4.3.2"));
  }
  const modeS = form.eq10b.filter((code) => ["E", "H", "I", "L", "P", "S", "X"].includes(code));
  if (modeS.length > 1) {
    errors.push(issue("eq10b", "Escolha apenas um código de transponder Modo S.", "2.2.4.3.3"));
  }
  if (form.eq10b.join("").length > 20) {
    errors.push(issue("eq10b", "Campo 10 B: máximo de 20 caracteres.", "2.2.4.3.1.1"));
  }

  const dep = form.depAd.trim().toUpperCase();
  if (!ICAO_OR_ZZZZ.test(dep)) {
    errors.push(issue("depAd", "Partida: 4 letras OACI ou ZZZZ.", "2.2.5.1"));
  }
  if (dep === "ZZZZ" && !has18(form, "DEP")) {
    errors.push(issue("DEP", "ZZZZ no Campo 13 exige DEP/ no Campo 18.", "2.2.5.1"));
  }
  if (!timeOk(form.depTime)) {
    errors.push(issue("depTime", "EOBT em UTC com 4 algarismos (HHMM).", "2.2.5.2"));
  }

  const dest = form.destAd.trim().toUpperCase();
  if (!ICAO_OR_ZZZZ.test(dest)) {
    errors.push(issue("destAd", "Destino: 4 letras OACI ou ZZZZ.", "2.2.7.1"));
  }
  if (dest === "ZZZZ" && !has18(form, "DEST")) {
    errors.push(issue("DEST", "ZZZZ no destino exige DEST/ no Campo 18.", "2.2.7.1 b"));
  }
  if (!timeOk(form.eet)) {
    errors.push(issue("eet", "EET total com 4 algarismos (HHMM).", "1.4.2 d / 2.2.7.1"));
  }
  const altn = form.altn.trim().toUpperCase();
  if (altn && !ICAO_OR_ZZZZ.test(altn)) {
    errors.push(issue("altn", "Alternativo: 4 letras OACI ou ZZZZ.", "2.2.7.2"));
  }
  if (!altn) {
    errors.push(issue("altn", "Informe o aeródromo alternativo (ou deixe ZZZZ + ALTN/).", "2.2.7.2", "warning"));
  }
  if (altn === "ZZZZ" && !has18(form, "ALTN")) {
    errors.push(issue("ALTN", "ZZZZ no alternativo exige ALTN/ no Campo 18.", "2.2.7.2 b"));
  }
  const altn2 = form.altn2.trim().toUpperCase();
  if (altn2 && !ICAO_OR_ZZZZ.test(altn2)) {
    errors.push(issue("altn2", "2º alternativo: 4 letras OACI ou ZZZZ.", "2.2.7.2"));
  }

  const speed = form.cruiseSpeed.trim().toUpperCase();
  if (!SPEED.test(speed)) {
    errors.push(issue("cruiseSpeed", "Velocidade: N0090, K0650 ou M082.", "2.2.6.1"));
  }
  const level = form.level.trim().toUpperCase();
  if (!LEVEL.test(level)) {
    errors.push(issue("level", "Nível: F080, A035, VFR, Sxxxx ou Mxxxx.", "2.2.6.2"));
  }
  if (!form.route.trim()) {
    errors.push(issue("route", "Informe a rota (DCT, REA, pontos ou coordenadas).", "2.2.6.3"));
  }
  if ((form.flightRules === "Y" || form.flightRules === "Z") && !/\b(IFR|VFR)\b/i.test(form.route)) {
    errors.push(
      issue("route", "Com Y ou Z, indique no Campo 15 o ponto de mudança de regra de voo.", "2.2.2.1 NOTA", "warning"),
    );
  }
  if (form.kind === "pvs" && dest && dep && dest !== dep) {
    errors.push(
      issue(
        "kind",
        "PVS só se o voo permanecer na ATZ/CTR/TMA/FIZ ou a até 50 km do aeródromo de partida. Destino diferente exige conferir se ainda cabe PVS.",
        "ICA 100-11 / MCA 3.1",
        "warning",
      ),
    );
  }

  if (form.dof && !DOF.test(form.dof)) {
    errors.push(issue("dof", "DOF/ deve ser YYMMDD.", "2.2.8.1.9"));
  }
  if (has18(form, "PBN")) {
    const pbn = (form.item18.PBN ?? "").replace(/\s/g, "").toUpperCase();
    if (!PBN.test(pbn) || pbn.length > 16) {
      errors.push(issue("PBN", "PBN/ inválido: até 8 designadores (A1, B1–B6, C1–C4, D1–D4, L1, O1–O4, S1–S2, T1–T2).", "2.2.8.1.2"));
    }
  }
  if (has18(form, "PER") && !["A", "B", "C", "D", "E", "H"].includes((form.item18.PER ?? "").trim().toUpperCase())) {
    errors.push(issue("PER", "PER/ deve ser A, B, C, D, E ou H.", "2.2.8.1.16"));
  }
  if (has18(form, "STS")) {
    const sts = (form.item18.STS ?? "").trim().toUpperCase();
    const allowed = [
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
    ];
    if (!allowed.includes(sts)) {
      errors.push(issue("STS", "STS/ deve usar um designador da tabela da MCA (ou passe o motivo para RMK/).", "2.2.8.1.1"));
    }
  }
  const keys = form.item18Keys.filter((key) => has18(form, key) || key === "FROM");
  if (keys.includes("FROM") && keys[keys.length - 1] !== "FROM") {
    errors.push(issue("FROM", "FROM deve ser o último dado do Campo 18.", "2.2.8.1.21 i NOTA 3", "warning"));
  }

  if (!timeOk(form.item19.endurance)) {
    errors.push(issue("endurance", "Autonomia em HHMM (4 algarismos).", "2.2.9.2"));
  }
  const pob = form.item19.personsOnBoard.trim().toUpperCase();
  if (!/^\d{1,3}$/.test(pob) && pob !== "TBN") {
    errors.push(issue("personsOnBoard", "Pessoas a bordo: número ou TBN.", "2.2.9.3"));
  }
  if (form.item19.dinghyD) {
    if (!form.item19.dinghyNumber.trim()) {
      errors.push(issue("dinghies", "Com botes (D), informe o número.", "2.2.9.4 D/"));
    }
    if (!form.item19.dinghyCapacity.trim()) {
      errors.push(issue("dinghies", "Com botes (D), informe a capacidade total.", "2.2.9.4 D/"));
    }
    if (!form.item19.dinghyColor.trim()) {
      errors.push(issue("dinghies", "Com botes (D), informe a cor.", "2.2.9.4 D/", "warning"));
    }
  }
  if (!form.item19.aircraftColor.trim()) {
    errors.push(issue("aircraftColor", "Informe a cor e as marcas da aeronave.", "2.2.9.4 A/"));
  }
  if (!form.item19.picName.trim()) {
    errors.push(issue("picName", "Informe o piloto em comando.", "2.2.9.4 C/"));
  }
  if (!form.item19.anac1.trim()) {
    errors.push(issue("anac1", "Informe o código ANAC do 1º piloto.", "2.2.9.1"));
  }
  if (!form.item19.phone.trim()) {
    errors.push(issue("phone", "Informe o telefone de contato.", "2.2.9"));
  }

  return errors;
}

export function buildFplPreview(form: FplPlanForm): string {
  const id = form.aircraftId.trim().toUpperCase().replace(/[-\s]/g, "") || "??????";
  const rules = `${form.flightRules || "?"}${form.flightType || "?"}`;
  const type = form.aircraftType.trim().toUpperCase() || "????";
  const wake = form.wake || "?";
  const eqA = form.eq10a.join("") || "?";
  const eqB = form.eq10b.join("") || "?";
  const dep = form.depAd.trim().toUpperCase() || "????";
  const time = digitsTime(form.depTime) || "????";
  const speed = form.cruiseSpeed.trim().toUpperCase() || "?????";
  const level = form.level.trim().toUpperCase() || "????";
  const route = form.route.trim().toUpperCase() || "DCT";
  const dest = form.destAd.trim().toUpperCase() || "????";
  const eet = digitsTime(form.eet) || "????";
  const altn = form.altn.trim().toUpperCase();
  const altn2 = form.altn2.trim().toUpperCase();
  const other = [
    form.dof ? `DOF/${form.dof}` : "",
    ...form.item18Keys.map((key) => {
      const value = form.item18[key]?.trim();
      return value ? `${key}/${value}` : "";
    }),
  ]
    .filter(Boolean)
    .join(" ");
  return `(FPL-${id}-${rules}\n-${form.number || ""}${type}/${wake}-${eqA}/${eqB}\n-${dep}${time}\n-${speed}${level} ${route}\n-${dest}${eet} ${altn}${altn2 ? ` ${altn2}` : ""}\n-${other || "0"})`;
}
