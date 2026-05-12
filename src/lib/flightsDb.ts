import { Query } from "appwrite";
import { BUCKET_ID, databases, ID, isAppwriteConfigured, Permission, Role, storage } from "./appwrite";
import { decodeFlightRecord, encodeFlightRecord } from "./flightRecordCodec";
import type { UserRole } from "./rbac";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_ID = import.meta.env.VITE_APPWRITE_COLLECTION_ID as string;

export type SavedFlightListItem = {
  id: string;
  name: string;
  source_filename: string;
  created_at: string;
  aircraft_ident: string | null;
  duration_sec: number | null;
  flight_date: string | null;
  start_time: string | null;
  student_user_id: string | null;
  instructor_user_id: string | null;
};

export type SavedFlightFull = SavedFlightListItem & { csv_text: string };

function toSavedFlightListItem(d: { [key: string]: unknown; $id: string; $createdAt: string }): SavedFlightListItem {
  return {
    id: d.$id,
    name: d.name as string,
    source_filename: d.source_filename as string,
    created_at: d.$createdAt,
    aircraft_ident: (d.aircraft_ident as string | null | undefined) ?? null,
    duration_sec: (d.duration_sec as number | null | undefined) ?? null,
    flight_date: (d.flight_date as string | null | undefined) ?? null,
    start_time: (d.start_time as string | null | undefined) ?? null,
    student_user_id: (d.student_user_id as string | null | undefined) ?? (d.user_id as string | null | undefined) ?? null,
    instructor_user_id: (d.instructor_user_id as string | null | undefined) ?? null,
  };
}

function getFlightScheduleFields(csvText: string): { flight_date: string | null; start_time: string | null } {
  const meta = decodeFlightRecord(csvText).meta;
  return {
    flight_date: meta?.header.date || null,
    start_time: meta?.header.startTime?.trim() || null,
  };
}

function buildActorOwnedPermissions(actorUserId: string) {
  return [
    Permission.read(Role.users()),
    Permission.read(Role.user(actorUserId)),
    Permission.update(Role.user(actorUserId)),
    Permission.delete(Role.user(actorUserId)),
  ];
}

function canSetClientSidePermission(permission: string, actorUserId: string): boolean {
  return (
    permission.includes(`("user:${actorUserId}")`) ||
    permission.includes('("users")') ||
    permission.includes('("users/unverified")') ||
    permission.includes('("label:instrutor")')
  );
}

function buildFlightDocumentPermissions(
  actorUserId: string,
  studentUserId?: string | null,
  instructorUserId?: string | null,
) {
  const permissions = buildActorOwnedPermissions(actorUserId);
  if (instructorUserId || studentUserId) {
    permissions.push(Permission.read(Role.label("instrutor")));
    permissions.push(Permission.update(Role.label("instrutor")));
  }
  return Array.from(new Set(permissions));
}

function mergeFlightDocumentPermissions(
  existing: string[],
  actorUserId: string,
  studentUserId?: string | null,
  instructorUserId?: string | null,
) {
  const allowedExisting = existing.filter((permission) => canSetClientSidePermission(permission, actorUserId));
  return Array.from(
    new Set([...allowedExisting, ...buildFlightDocumentPermissions(actorUserId, studentUserId, instructorUserId)]),
  );
}

export async function listSavedFlights(
  viewer: { userId: string; role: UserRole },
): Promise<{ data: SavedFlightListItem[] | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  try {
    const queries = [Query.orderDesc("$createdAt"), Query.limit(200)];
    if (viewer.role === "aluno") {
      queries.push(Query.equal("student_user_id", [viewer.userId]));
    } else if (viewer.role === "instrutor") {
      queries.push(Query.equal("instructor_user_id", [viewer.userId]));
    }

    const res = await databases.listDocuments(DB_ID, COL_ID, queries);
    const data = res.documents.map(toSavedFlightListItem);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function listStudentFlightHistory(params: {
  actorUserId: string;
  actorRole: UserRole;
  studentUserId: string;
}): Promise<{ data: SavedFlightListItem[] | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  try {
    if (params.actorRole !== "instrutor" && params.actorRole !== "admin") {
      return { data: null, error: new Error("Apenas instrutor/admin pode consultar o histórico do aluno.") };
    }

    const res = await databases.listDocuments(DB_ID, COL_ID, [
      Query.equal("student_user_id", [params.studentUserId]),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ]);
    const data = res.documents.map(toSavedFlightListItem);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function getSavedFlight(id: string): Promise<{ data: SavedFlightFull | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  try {
    const d = await databases.getDocument(DB_ID, COL_ID, id);
    const csvFileId = d.csv_file_id as string | null | undefined;
    let csvText: string;

    if (csvFileId && storage && BUCKET_ID) {
      try {
        const url = storage.getFileDownload(BUCKET_ID, csvFileId);
        const res = await fetch(url.toString(), { credentials: "include" });
        if (res.ok) {
          csvText = await res.text();
        } else {
          csvText = (d.csv_text as string | null | undefined) ?? "";
        }
      } catch {
        csvText = (d.csv_text as string | null | undefined) ?? "";
      }
    } else {
      csvText = (d.csv_text as string | null | undefined) ?? "";
    }

    return {
      data: {
        id: d.$id,
        name: d.name as string,
        source_filename: d.source_filename as string,
        created_at: d.$createdAt,
        aircraft_ident: (d.aircraft_ident as string | null | undefined) ?? null,
        duration_sec: (d.duration_sec as number | null | undefined) ?? null,
        flight_date: (d.flight_date as string | null | undefined) ?? null,
        start_time: (d.start_time as string | null | undefined) ?? null,
        student_user_id: (d.student_user_id as string | null | undefined) ?? (d.user_id as string | null | undefined) ?? null,
        instructor_user_id: (d.instructor_user_id as string | null | undefined) ?? null,
        csv_text: csvText,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function insertFlight(payload: {
  actorUserId: string;
  actorRole: UserRole;
  studentUserId: string;
  instructorUserId?: string | null;
  name: string;
  source_filename: string;
  csv_text: string;
  aircraft_ident?: string | null;
  duration_sec?: number | null;
}): Promise<{ id: string | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { id: null, error: new Error("Appwrite não configurado") };
  }

  try {
    const canUpload = payload.actorRole === "instrutor" || payload.actorRole === "admin";
    if (!canUpload) {
      return { id: null, error: new Error("Apenas instrutor ou admin pode enviar voos.") };
    }

    const scheduleFields = getFlightScheduleFields(payload.csv_text);
    const permissions = buildFlightDocumentPermissions(payload.actorUserId, payload.studentUserId, payload.instructorUserId);

    let csvFileId: string | null = null;
    if (storage && BUCKET_ID) {
      const blob = new Blob([payload.csv_text], { type: "text/csv" });
      const file = new File([blob], payload.source_filename, { type: "text/csv" });
      const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, permissions);
      csvFileId = uploaded.$id;
    }

    const d = await databases.createDocument(
      DB_ID,
      COL_ID,
      ID.unique(),
      {
        user_id: payload.studentUserId,
        student_user_id: payload.studentUserId,
        instructor_user_id: payload.instructorUserId ?? null,
        created_by_role: payload.actorRole,
        name: payload.name,
        source_filename: payload.source_filename,
        csv_text: payload.csv_text,
        csv_file_id: csvFileId,
        aircraft_ident: payload.aircraft_ident ?? null,
        duration_sec: payload.duration_sec ?? null,
        flight_date: scheduleFields.flight_date,
        start_time: scheduleFields.start_time,
      },
      permissions,
    );

    return { id: d.$id, error: null };
  } catch (e) {
    return { id: null, error: e as Error };
  }
}

export async function updateFlight(id: string, payload: {
  actorUserId: string;
  actorRole: UserRole;
  studentUserId: string;
  instructorUserId?: string | null;
  name: string;
  source_filename: string;
  csv_text: string;
  aircraft_ident?: string | null;
  duration_sec?: number | null;
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const canUpload = payload.actorRole === "instrutor" || payload.actorRole === "admin";
    if (!canUpload) {
      return { error: new Error("Apenas instrutor ou admin pode atualizar voos.") };
    }

    const scheduleFields = getFlightScheduleFields(payload.csv_text);
    const current = await databases.getDocument(DB_ID, COL_ID, id);
    const permissions = mergeFlightDocumentPermissions(
      (current.$permissions as string[] | undefined) ?? [],
      payload.actorUserId,
      payload.studentUserId,
      payload.instructorUserId,
    );

    let csvFileId: string | null = null;
    if (storage && BUCKET_ID) {
      const blob = new Blob([payload.csv_text], { type: "text/csv" });
      const file = new File([blob], payload.source_filename, { type: "text/csv" });
      const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, permissions);
      csvFileId = uploaded.$id;
    }

    await databases.updateDocument(DB_ID, COL_ID, id, {
      user_id: payload.studentUserId,
      student_user_id: payload.studentUserId,
      instructor_user_id: payload.instructorUserId ?? null,
      created_by_role: payload.actorRole,
      name: payload.name,
      source_filename: payload.source_filename,
      csv_text: payload.csv_text,
      csv_file_id: csvFileId,
      aircraft_ident: payload.aircraft_ident ?? null,
      duration_sec: payload.duration_sec ?? null,
      flight_date: scheduleFields.flight_date,
      start_time: scheduleFields.start_time,
    }, permissions);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function updateStudentFlightSuggestion(id: string, payload: {
  actorUserId: string;
  suggestionMd: string;
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const saved = await getSavedFlight(id);
    if (saved.error || !saved.data) {
      return { error: saved.error ?? new Error("Voo não encontrado.") };
    }
    if (saved.data.student_user_id !== payload.actorUserId) {
      return { error: new Error("Você só pode atualizar a sugestão dos seus próprios voos.") };
    }

    const decoded = decodeFlightRecord(saved.data.csv_text);
    if (!decoded.meta) {
      return { error: new Error("Ficha do voo sem metadados para atualizar.") };
    }

    const nextMeta = {
      ...decoded.meta,
      preFlight: {
        ...decoded.meta.preFlight,
        studentSuggestionMd: payload.suggestionMd.trim(),
      },
    };
    const csvText = encodeFlightRecord({ meta: nextMeta, telemetryCsv: decoded.telemetryCsv });

    await databases.updateDocument(DB_ID, COL_ID, id, {
      csv_text: csvText,
      csv_file_id: null,
    });
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function updateInstructorFlightSuggestion(id: string, payload: {
  actorUserId: string;
  suggestionMd: string;
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const saved = await getSavedFlight(id);
    if (saved.error || !saved.data) {
      return { error: saved.error ?? new Error("Voo não encontrado.") };
    }
    if (saved.data.instructor_user_id !== payload.actorUserId) {
      return { error: new Error("Você só pode atualizar a sugestão dos voos atribuídos a você.") };
    }

    const decoded = decodeFlightRecord(saved.data.csv_text);
    if (!decoded.meta) {
      return { error: new Error("Ficha do voo sem metadados para atualizar.") };
    }

    const nextMeta = {
      ...decoded.meta,
      preFlight: {
        ...decoded.meta.preFlight,
        instructorSuggestionMd: payload.suggestionMd.trim(),
      },
    };
    const csvText = encodeFlightRecord({ meta: nextMeta, telemetryCsv: decoded.telemetryCsv });

    await databases.updateDocument(DB_ID, COL_ID, id, {
      csv_text: csvText,
      csv_file_id: null,
    });
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function deleteSavedFlight(id: string): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    // Try to delete the associated CSV file from Storage as well
    if (storage && BUCKET_ID) {
      try {
        const d = await databases.getDocument(DB_ID, COL_ID, id);
        const csvFileId = d.csv_file_id as string | null | undefined;
        if (csvFileId) {
          await storage.deleteFile(BUCKET_ID, csvFileId);
        }
      } catch {
        // Ignore storage deletion errors — document deletion is the priority
      }
    }
    await databases.deleteDocument(DB_ID, COL_ID, id);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
