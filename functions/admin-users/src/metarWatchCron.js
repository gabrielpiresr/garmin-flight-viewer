"use strict";

/**
 * Entrypoint leve só para o listener de METAR/TAF no WhatsApp.
 * Agendar esta function a cada 10–15 min (separado do cron pesado de listSummaries).
 */
module.exports = async (context) => {
  const { req } = context;
  const payload = { action: "runAiswebMetarWatchScan" };
  const raw = JSON.stringify(payload);
  try {
    Object.defineProperty(req, "bodyJson", { value: payload, configurable: true });
  } catch {
    req.bodyJson = payload;
  }
  req.body = raw;
  req.bodyRaw = raw;
  req.payload = payload;
  return require("./main")(context);
};
