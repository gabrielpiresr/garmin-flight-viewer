/** Simulates admin-users isCompletedFlight against saga_flight_739 */
function isFutureFlight(flight) {
  const date = flight.flightDate || (flight.createdAt || "").slice(0, 10);
  if (!date) return false;
  const time = flight.startTime || "23:59";
  const dateTime = new Date(`${date}T${time.length === 5 ? time : "23:59"}:00`);
  return !Number.isNaN(dateTime.getTime()) && dateTime.getTime() > Date.now();
}

function isCompletedFlightBefore(flight) {
  return (flight.durationSec || 0) > 0 && (flight.landings || 0) > 0;
}

function isCompletedFlightAfter(flight) {
  if (isFutureFlight(flight)) return false;
  if (flight.flightStatus === "Previsto") return false;
  const hasDuration = (flight.durationSec || 0) > 0;
  if (!hasDuration) return false;
  return (flight.landings || 0) > 0 || flight.flightStatus === "Realizado";
}

const flight739 = {
  id: "saga_flight_739",
  flightDate: "2026-05-21",
  startTime: null,
  createdAt: "2026-06-02T13:54:31.593+00:00",
  durationSec: 3600,
  landings: 0,
  flightStatus: "Realizado",
};

const flight744 = {
  id: "saga_flight_744",
  flightDate: "2026-05-21",
  durationSec: 7200,
  landings: 3,
  flightStatus: "Realizado",
};

const futureScheduled = {
  id: "saga_schedule_1173",
  flightDate: "2026-06-03",
  durationSec: 3600,
  landings: 0,
  flightStatus: "Previsto",
};

console.log(
  JSON.stringify(
    {
      flight739: { before: isCompletedFlightBefore(flight739), after: isCompletedFlightAfter(flight739) },
      flight744: { before: isCompletedFlightBefore(flight744), after: isCompletedFlightAfter(flight744) },
      futureScheduled: {
        before: isCompletedFlightBefore(futureScheduled),
        after: isCompletedFlightAfter(futureScheduled),
      },
    },
    null,
    2,
  ),
);
