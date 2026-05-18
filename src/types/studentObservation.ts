export type StudentObservation = {
  $id: string;
  student_user_id: string;
  author_user_id: string;
  author_name: string;
  author_role: "admin" | "instrutor";
  content: string;
  $createdAt: string;
};
