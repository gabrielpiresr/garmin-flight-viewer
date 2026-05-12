import { parseGarminCsv } from "../lib/parseGarminCsv";

self.onmessage = (e: MessageEvent<string>) => {
  try {
    const result = parseGarminCsv(e.data);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
