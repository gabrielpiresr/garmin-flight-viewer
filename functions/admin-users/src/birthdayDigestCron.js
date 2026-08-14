"use strict";

/**
 * Entrypoint leve: e-mail matinal de aniversariantes para admins.
 * Agendar às 08:00 America/Sao_Paulo (0 11 * * * UTC). Não envia se não houver aniversário.
 */
module.exports = async (context) => {
  const payload = { action: "runBirthdayDigestScan" };
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
