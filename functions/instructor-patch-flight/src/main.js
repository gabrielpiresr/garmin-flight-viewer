import { Client, Databases } from "node-appwrite";

const META_PREFIX = "#GFV_META_V1:";
const DB_ID = process.env.DATABASE_ID;
const FLIGHTS_COL_ID = process.env.FLIGHTS_COL_ID;

function extractMaterializedFields(csvText) {
  if (!csvText?.trim()) return {};
  try {
    const meta = decodeMeta(csvText);
    if (!meta) return {};
    const legs = meta.legs ?? [];
    if (!legs.length) return {};

    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    const dep = firstLeg?.dep ?? "";
    const arr = lastLeg?.arr ?? "";
    const fromTo = dep && arr ? (dep === arr ? dep : `${dep} → ${arr}`) : "";
    const landings = legs.reduce((s, l) => s + (Number(l.landings) || 0), 0);

    function toDurationMinutes(hhmm) {
      if (!hhmm) return 0;
      const [h, m] = String(hhmm).split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    }
    function toClockMinutes(hhmm) {
      const match = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const h = Number(match[1]);
      const m = Number(match[2]);
      if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
      return h * 60 + m;
    }
    function clockDiffMinutes(start, end) {
      const startMin = toClockMinutes(start);
      const endMin = toClockMinutes(end);
      if (startMin === null || endMin === null) return null;
      const diff = endMin >= startMin ? endMin - startMin : endMin + 24 * 60 - startMin;
      return diff > 0 ? diff : null;
    }
    const totalFlightMinutes = legs.reduce((s, l) => s + toDurationMinutes(l.flightTime), 0);
    const blockMinutes = legs.reduce((s, l) => s + (clockDiffMinutes(l.engineStart, l.engineCut) ?? 0), 0);
    const flightDate = meta.header?.date ?? null;
    const startTime = legs.find((leg) => String(leg.engineStart || "").trim())?.engineStart ?? meta.header?.startTime ?? null;

    return {
      ...(fromTo ? { from_to: fromTo } : {}),
      ...(landings > 0 ? { landings } : {}),
      ...(totalFlightMinutes > 0 ? { total_flight_minutes: totalFlightMinutes } : {}),
      ...(blockMinutes > 0 ? { block_time_minutes: blockMinutes } : {}),
      ...(flightDate ? { flight_date: flightDate } : {}),
      ...(startTime ? { start_time: startTime } : {}),
      weight_balance_complete: isWeightBalanceComplete(meta.weightBalance),
    };
  } catch {
    return {};
  }
}

function decodeMeta(csvText) {
  const firstLine = String(csvText || "").split("\n")[0]?.trim() ?? "";
  if (!firstLine.startsWith(META_PREFIX)) return null;
  const encoded = firstLine.slice(META_PREFIX.length).trim();
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(decoded);
}

function isWeightBalanceComplete(weightBalance) {
  return Boolean(
    weightBalance &&
      weightBalance.inputs?.occupantsWeightKg != null &&
      weightBalance.inputs?.baggageWeightKg != null &&
      weightBalance.inputs?.rampFuel?.value != null &&
      weightBalance.inputs?.taxiFuel?.value != null &&
      weightBalance.inputs?.tripFuel?.value != null &&
      weightBalance.results?.isComplete,
  );
}

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);

  if (!DB_ID || !FLIGHTS_COL_ID) {
    return res.json({ ok: false, message: "Function misconfigured (DATABASE_ID or FLIGHTS_COL_ID missing)." }, 500);
  }

  try {
    const body = JSON.parse(req.body || "{}");
    const {
      action,
      flightId,
      csvText,
      flightStatus,
      trainingTrackId,
      trainingStageId,
      trainingMissionId,
      trainingSnapshotJson,
      weightBalance,
    } = body;

    if (action !== "patchFlightAsInstructor" && action !== "patchWeightBalanceAsStudent") {
      return res.json({ ok: false, message: "Unknown action." }, 400);
    }
    if (!flightId) {
      return res.json({ ok: false, message: "flightId required." }, 400);
    }

    const callerUserId = req.headers["x-appwrite-user-id"];
    if (!callerUserId) {
      return res.json({ ok: false, message: "Not authenticated." }, 401);
    }

    const flight = await databases.getDocument(DB_ID, FLIGHTS_COL_ID, flightId);

    if (action === "patchWeightBalanceAsStudent") {
      if (flight.student_user_id !== callerUserId && flight.user_id !== callerUserId) {
        return res.json({ ok: false, message: "Only the assigned student can update this weight and balance." }, 403);
      }
      if (flight.instructor_signed) {
        return res.json({ ok: false, message: "Flight is locked (already signed by instructor)." }, 403);
      }
      if (!csvText || !weightBalance) {
        return res.json({ ok: false, message: "csvText and weightBalance required." }, 400);
      }
      const meta = decodeMeta(csvText);
      if (!meta) {
        return res.json({ ok: false, message: "Flight record metadata missing." }, 400);
      }
      const materialized = extractMaterializedFields(csvText);
      await databases.updateDocument(DB_ID, FLIGHTS_COL_ID, flightId, {
        csv_text: csvText,
        csv_file_id: null,
        ...materialized,
      });

      log(`studentWeightBalancePatch: updated ${flightId} by ${callerUserId}`);
      return res.json({ ok: true });
    }

    if (flight.instructor_user_id !== callerUserId) {
      return res.json({ ok: false, message: "Only the assigned instructor can fill this flight record." }, 403);
    }
    if (flight.instructor_signed) {
      return res.json({ ok: false, message: "Flight is locked (already signed by instructor)." }, 403);
    }

    const materialized = csvText ? extractMaterializedFields(csvText) : {};

    const updateData = {
      ...(csvText !== undefined ? { csv_text: csvText, csv_file_id: null } : {}),
      ...(flightStatus !== undefined ? { flight_status: flightStatus } : {}),
      ...(trainingTrackId !== undefined ? { training_track_id: trainingTrackId } : {}),
      ...(trainingStageId !== undefined ? { training_stage_id: trainingStageId } : {}),
      ...(trainingMissionId !== undefined ? { training_mission_id: trainingMissionId } : {}),
      ...(trainingSnapshotJson !== undefined ? { training_snapshot_json: trainingSnapshotJson } : {}),
      ...materialized,
    };

    if (!Object.keys(updateData).length) {
      return res.json({ ok: false, message: "Nothing to update." }, 400);
    }

    await databases.updateDocument(DB_ID, FLIGHTS_COL_ID, flightId, updateData);

    log(`instructorPatchFlight: updated ${flightId} by ${callerUserId}`);
    return res.json({ ok: true });
  } catch (err) {
    error(err.message);
    return res.json({ ok: false, message: err.message }, 500);
  }
};
