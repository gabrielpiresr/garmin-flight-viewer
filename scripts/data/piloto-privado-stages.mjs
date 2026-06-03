/** Cronograma Piloto Privado (PDF) — fases na 1ª coluna, missões/tempo/tipo/manobras nas demais. */
export const PILOTO_PRIVADO_TRACK_NAME = "Piloto Privado";

export const PILOTO_PRIVADO_STAGES = [
  {
    id: "pre-solo",
    name: "FASE PRÉ SOLO",
    order: 1,
    missions: [
      ["ps1", "PS1", 60, "DC", ["Familiarização com a Aeronave", "Demonstração básica dos comandos"]],
      ["ps2", "PS2", 60, "DC", ["Voo ascendente", "Voo descendente", "Voo linha reta horizontal (VLRH)", "Mudança de atitude"]],
      ["ps3", "PS3", 60, "DC", ["Curvas (90°, 180°, 270°, 360°)", "Curvas ascendentes e descendentes"]],
      ["ps4", "PS4", 60, "DC", ["Voo planado", "Voo planado com curvas"]],
      ["ps5", "PS5", 60, "DC", ["Coordenação de 1º tipo", "Coordenação de 2º tipo"]],
      ["ps6", "PS6", 60, "DC", ["Voo em retângulo", "\"S\" sobre estradas"]],
      ["ps7", "PS7", 60, "DC", ["Oito ao redor de Marcos"]],
      ["ps8", "PS8", 60, "DC", [
        "Estol com motor e sem motor",
        "Coordenação atitude x potência x velocidade (CAP)",
        "Velocidade mínima de controle (VMC)",
      ]],
      ["ps9", "PS9", 60, "DC", [
        "Emergência simulada fora do circuito",
        "Decolagem curta",
        "Glissada (frontal e lateral)",
      ]],
      ["ps10", "PS10", 60, "DC", ["Decolagem curta", "Emergência simulada fora do circuito de tráfego"]],
      ["ps11", "PS11", 60, "DC", ["TGL - (A) APRESENTAÇÃO"]],
      ["ps12", "PS12", 60, "DC", ["TGL - (C) COMPREENSÃO"]],
      ["ps13", "PS13", 60, "DC", ["TGL - (C) COMPREENSÃO"]],
      ["ps14", "PS14", 60, "DC", ["TGL - (C) COMPREENSÃO"]],
      ["ps15", "PS15", 60, "DC", ["TGL - (E) EXECUÇÃO"]],
      ["ps16", "PS16", 60, "DC", ["TGL AD ALTERNATIVO - SNDD - A / C / E"]],
      ["ps17", "PS17", 60, "DC", ["TGL AD ALTERNATIVO - SDTB - A / C / E"]],
      ["ps18", "PS18", 60, "DC", ["Emergência no circuito (90°, 180°, 360°) - APRESENTAÇÃO"]],
      ["ps19", "PS19", 60, "DC", [
        "Emergência no circuito (90°, 180°, 360°) - COMPREENSÃO",
        "Emergência na decolagem / decolagem abortada",
      ]],
      ["ps20", "PS20", 60, "DC", ["Emergência no circuito (90°, 180°, 360°) - EXECUÇÃO"]],
      ["psx", "PSX", 60, "SL", ["CIRCUITO SOLO + ENDOSSO"]],
    ],
  },
  {
    id: "aperfeicoamento",
    name: "APERFEIÇOAMENTO",
    order: 2,
    missions: [
      ["ap01", "AP01", 60, "DC", ["Preparação Voo solo - Sobrevoo ITU / RONDON / CERQ"]],
      ["ap02", "AP02", 60, "SL", ["Voo solo - sobrevoo ITU / RONDON / CERQUILHO"]],
      ["ap03", "AP03", 60, "DC", [
        "Preparação voo solo - Sobrevoo SBR459",
        "Curva 180º (Turn & Bank)",
        "Desorientação espacial",
      ]],
      ["ap04", "AP04", 60, "SL", ["Voo solo - sobrevoo SBR459"]],
      ["ap05", "AP05", 60, "DC", ["TGL SBJD ou SDTB - Emergências - Rejeição decolagem"]],
      ["ap06", "AP06", 60, "SL", ["Voo solo - Sobrevoo Itu ou SBR459"]],
      ["ap07", "AP07", 60, "SL", ["Voo solo - Sobrevoo Itu ou SBR459"]],
    ],
  },
  {
    id: "navegacao",
    name: "NAVEGAÇÃO",
    order: 3,
    missions: [
      ["nv01", "NV01", 120, "DC", ["Navegação SBJD -> SDCO -> SDPW -> SBJD"]],
      ["nv02", "NV02", 120, "SL", ["Navegação SBJD -> SDCO -> SDPW -> SBJD"]],
      ["nv03", "NV03", 180, "DC", [
        "Navegação SBJD -> SDCO -> SDRK -> SBJD (150 NM); ou",
        "Navegação SBJD -> SDJV -> SDAI -> SBJD (150 NM)",
        "Introdução ao uso do GPS + Piloto Automático",
      ]],
      ["nv04", "NV04", 120, "SL", ["Navegação SBJD -> SDAI ou SDRK"]],
      ["nv05", "NV05", 60, "SL", ["Navegação SBJD -> SDCO"]],
    ],
  },
  {
    id: "not",
    name: "NOT",
    order: 4,
    missions: [
      ["nt01", "NT01", 90, "DC", ["Voo Noturno (5 pousos)"]],
      ["nt02", "NT02", 90, "DC", ["Voo Noturno (5 pousos)"]],
    ],
  },
  {
    id: "av",
    name: "AV",
    order: 5,
    missions: [
      ["av01", "AV01", 60, "DC", ["AVALIAÇÃO FINAL - LIBERAÇÃO PARA CHEQUE"]],
    ],
  },
].map((stage) => ({
  ...stage,
  missions: stage.missions.map(([id, name, durationMinutes, type, maneuvers], index) => ({
    id,
    name,
    durationMinutes,
    type,
    maneuvers,
    order: index + 1,
  })),
}));

export function summarizePilotoPrivadoStages(stages = PILOTO_PRIVADO_STAGES) {
  return stages.reduce(
    (acc, stage) => {
      acc.missionCount += stage.missions.length;
      acc.totalMinutes += stage.missions.reduce((sum, mission) => sum + mission.durationMinutes, 0);
      return acc;
    },
    { missionCount: 0, totalMinutes: 0 },
  );
}
