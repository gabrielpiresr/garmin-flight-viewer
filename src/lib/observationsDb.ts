import { Query } from "appwrite";
import { databases, ID, STUDENT_OBSERVATIONS_COL_ID } from "./appwrite";
import type { StudentObservation } from "../types/studentObservation";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

export async function listStudentObservations(studentUserId: string): Promise<StudentObservation[]> {
  if (!databases || !DB_ID) return [];
  const res = await databases.listDocuments(DB_ID, STUDENT_OBSERVATIONS_COL_ID, [
    Query.equal("student_user_id", studentUserId),
    Query.orderDesc("$createdAt"),
    Query.limit(100),
  ]);
  return res.documents as unknown as StudentObservation[];
}

export async function createStudentObservation(data: {
  studentUserId: string;
  authorUserId: string;
  authorName: string;
  authorRole: "admin" | "instrutor";
  content: string;
}): Promise<StudentObservation> {
  if (!databases || !DB_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.createDocument(DB_ID, STUDENT_OBSERVATIONS_COL_ID, ID.unique(), {
    student_user_id: data.studentUserId,
    author_user_id: data.authorUserId,
    author_name: data.authorName,
    author_role: data.authorRole,
    content: data.content,
  });
  return doc as unknown as StudentObservation;
}

export async function deleteStudentObservation(observationId: string): Promise<void> {
  if (!databases || !DB_ID) throw new Error("Appwrite não configurado");
  await databases.deleteDocument(DB_ID, STUDENT_OBSERVATIONS_COL_ID, observationId);
}
