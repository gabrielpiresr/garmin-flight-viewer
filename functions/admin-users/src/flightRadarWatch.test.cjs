const test = require("node:test");
const assert = require("node:assert/strict");
const enrich = require("./wppFlightRadarEnrich");
const flightRadar = require("./flightRadar");

const SBJD = {
  icao: "SBJD",
  name: "Jundiai",
  lat: -23.18167,
  lon: -46.94361,
  isPublic: true,
};
const SDMA = {
  icao: "SDMA",
  name: "Muraro",
  lat: -23.18583,
  lon: -47.06056,
  isPublic: false,
};
const ADS = [SBJD, SDMA];

function groundAt(ad, extra = {}) {
  return {
    reg: "PT-ABC",
    fr24Id: "sameflight",
    lat: ad.lat,
    lon: ad.lon,
    alt: 0,
    gspeed: 0,
    origIcao: extra.origIcao || "SDMA",
    destIcao: extra.destIcao || "SDMA",
    ...extra,
  };
}

function airAt(ad, extra = {}) {
  return groundAt(ad, { alt: 1200, gspeed: 90, ...extra });
}

test("nearest aerodrome at SBJD is Jundiai, not Muraro", () => {
  const nearest = enrich.nearestAerodrome(ADS, SBJD.lat, SBJD.lon);
  assert.equal(nearest.icao, "SBJD");
});

test("FR24 orig SDMA loses to GPS at SBJD", () => {
  const nearest = enrich.nearestAerodrome(ADS, SBJD.lat, SBJD.lon);
  const icao = enrich.pickTakeoffIcao({ origIcao: "SDMA" }, null, nearest);
  assert.equal(icao, "SBJD");
});

test("snap converts Muraro (SDMA) to nearby public SBJD", () => {
  assert.equal(enrich.snapToNearbyPublicAerodrome("SDMA", ADS), "SBJD");
  assert.equal(enrich.snapToNearbyPublicAerodrome("SBJD", ADS), "SBJD");
});

test("landing without takeoff leg uses schedule near takeoff time, not the next student", () => {
  const slots = [
    {
      id: "morning",
      aircraftIdent: "PT-ABC",
      flightDate: "2026-08-18",
      studentName: "Aluno Manha",
      scheduledTakeoff: "08:00",
      scheduledLanding: "09:30",
      blockStart: "08:00",
      blockEnd: "09:30",
    },
    {
      id: "afternoon",
      aircraftIdent: "PT-ABC",
      flightDate: "2026-08-18",
      studentName: "Aluno Tarde",
      scheduledTakeoff: "11:00",
      scheduledLanding: "12:30",
      blockStart: "11:00",
      blockEnd: "12:30",
    },
  ];
  const lateLanding = enrich.matchScheduleSlot(slots, "PT-ABC", "2026-08-18T13:20:00-03:00", {
    eventType: "landing",
  });
  assert.equal(lateLanding?.studentName, "Aluno Tarde");

  const fromTakeoff = enrich.matchScheduleSlot(slots, "PT-ABC", "2026-08-18T13:20:00-03:00", {
    eventType: "landing",
    lastTakeoffAt: "2026-08-18T08:10:00-03:00",
  });
  assert.equal(fromTakeoff?.studentName, "Aluno Manha");
});

test("schedule fallback does not jump to a slot hours away", () => {
  const slots = [
    {
      aircraftIdent: "PT-ABC",
      flightDate: "2026-08-18",
      studentName: "Manha",
      scheduledTakeoff: "08:00",
      scheduledLanding: "09:00",
      blockStart: "08:00",
      blockEnd: "09:00",
    },
    {
      aircraftIdent: "PT-ABC",
      flightDate: "2026-08-18",
      studentName: "Noite",
      scheduledTakeoff: "16:00",
      scheduledLanding: "17:30",
      blockStart: "16:00",
      blockEnd: "17:30",
    },
  ];
  const unmatched = enrich.matchScheduleSlot(slots, "PT-ABC", "2026-08-18T12:00:00-03:00");
  assert.equal(unmatched, null);
});

test("same FR24 id still emits TGL takeoff and landing cycles", () => {
  const tracked = ["PT-ABC"];
  let state = { aircraft: {} };

  let result = flightRadar.detectFleetTransitions(state, [groundAt(SBJD)], tracked);
  state = result.state;
  assert.equal(result.events.length, 0);

  result = flightRadar.detectFleetTransitions(state, [airAt(SBJD)], tracked);
  state = result.state;
  assert.equal(result.events.map((event) => event.type).join(","), "takeoff");

  result = flightRadar.detectFleetTransitions(state, [groundAt(SBJD)], tracked);
  state = result.state;
  assert.equal(result.events.map((event) => event.type).join(","), "landing");

  result = flightRadar.detectFleetTransitions(state, [airAt(SBJD)], tracked);
  state = result.state;
  assert.equal(result.events.map((event) => event.type).join(","), "takeoff");

  result = flightRadar.detectFleetTransitions(state, [groundAt(SBJD)], tracked);
  assert.equal(result.events.map((event) => event.type).join(","), "landing");
});

test("landing event carries the open leg from the takeoff student", () => {
  const tracked = ["PT-ABC"];
  let state = {
    aircraft: {
      "PT-ABC": {
        status: "airborne",
        fr24Id: "sameflight",
        lastEventType: "takeoff",
        lastTakeoffAt: "2026-08-18T11:05:00.000Z",
        lastTakeoffIcao: "SBJD",
        openLeg: {
          studentName: "Aluno Que Decolou",
          instructorName: "Instrutor",
          takeoffIcao: "SBJD",
          takeoffAt: "2026-08-18T11:05:00.000Z",
        },
        updatedAt: "2026-08-18T11:05:00.000Z",
      },
    },
  };
  const result = flightRadar.detectFleetTransitions(state, [groundAt(SBJD)], tracked);
  assert.equal(result.events[0].type, "landing");
  assert.equal(result.events[0].openLeg.studentName, "Aluno Que Decolou");
  assert.equal(result.state.aircraft["PT-ABC"].openLeg, null);
});

test("pending watch events are retried and duplicates from detect are dropped", () => {
  const pending = [
    { type: "takeoff", reg: "PT-ABC", fr24Id: "abc", lastTakeoffAt: "t1", studentName: "Ana" },
  ];
  const incoming = [
    { type: "takeoff", reg: "PT-ABC", fr24Id: "abc", lastTakeoffAt: "t1" },
    { type: "landing", reg: "PT-ABC", fr24Id: "abc", lastTakeoffAt: "t1" },
  ];
  const merged = flightRadar.mergeWatchEvents(pending, incoming, []);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].studentName, "Ana");
  assert.equal(merged[1].type, "landing");

  const afterNotify = flightRadar.mergeWatchEvents(
    [],
    incoming,
    flightRadar.rememberWatchEventKeys([], merged),
  );
  assert.equal(afterNotify.length, 0);
});
