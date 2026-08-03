"use strict";

/**
 * Entrypoint leve só para o listener de METAR/TAF no WhatsApp.
 * Agendar esta function a cada 10–15 min (separado do cron pesado de listSummaries).
 */
module.exports = async (context) => {
  const payload = { action: "runAiswebMetarWatchScan" };
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
