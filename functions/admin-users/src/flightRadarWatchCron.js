"use strict";

/**
 * Entrypoint leve só para avisos WPP de decolagem/pouso (FlightRadar watch).
 * Agendar esta function a cada 3 min (separado do cron pesado de listSummaries).
 */
module.exports = async (context) => {
  const payload = { action: "runFlightRadarWatchScan" };
  const raw = JSON.stringify(payload);
  const req = context.req;
  const patchedReq = new Proxy(req, {
    get(target, prop, receiver) {
      if (prop === "bodyJson") return payload;
      if (prop === "body" || prop === "bodyRaw") return raw;
      if (prop === "payload") return payload;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return require("./main")({ ...context, req: patchedReq });
};
