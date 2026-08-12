import type { Plugin } from "vite";

/**
 * Serves `/api/geoaisweb/wms` during `vite dev` with the same sheet-filtering
 * handler used on Vercel, so local WAC/REA testing matches production.
 */
export function geoaiswebWmsDevPlugin(): Plugin {
  return {
    name: "geoaisweb-wms-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = req.url || "";
          if (!url.startsWith("/api/geoaisweb/wms")) {
            next();
            return;
          }
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
          }

          const mod = await server.ssrLoadModule("/api/geoaisweb/wms.js");
          const handler = mod.default as (req: unknown, res: unknown) => Promise<void>;

          const u = new URL(url, "http://localhost");
          const query: Record<string, string> = {};
          u.searchParams.forEach((value, key) => {
            query[key] = value;
          });

          const fakeReq = { method: "GET", query, url };
          const fakeRes = {
            statusCode: 200,
            headers: {} as Record<string, string>,
            status(code: number) {
              this.statusCode = code;
              return this;
            },
            setHeader(name: string, value: string) {
              this.headers[name.toLowerCase()] = value;
              return this;
            },
            json(body: unknown) {
              const payload = JSON.stringify(body);
              res.statusCode = this.statusCode;
              for (const [k, v] of Object.entries(this.headers)) res.setHeader(k, v);
              res.setHeader("content-type", "application/json");
              res.end(payload);
            },
            end(body?: string) {
              res.statusCode = this.statusCode;
              for (const [k, v] of Object.entries(this.headers)) res.setHeader(k, v);
              res.end(body ?? "");
            },
            send(body: Buffer | string) {
              res.statusCode = this.statusCode;
              for (const [k, v] of Object.entries(this.headers)) res.setHeader(k, v);
              res.end(body);
            },
          };

          await handler(fakeReq, fakeRes);
        } catch (err) {
          console.error("[geoaisweb-wms-dev]", err);
          res.statusCode = 500;
          res.end("geoaisweb wms proxy error");
        }
      });
    },
  };
}
