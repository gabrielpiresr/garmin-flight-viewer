# Create Flight Function

This Appwrite Function enforces role-based upload rules:

- `admin` and `instrutor` can create flights.
- `aluno` cannot create flights.
- `instrutor` must be linked to the target student in `instructor_students`.

## Required Function Environment Variables

- `APPWRITE_FUNCTION_API_ENDPOINT`
- `APPWRITE_FUNCTION_PROJECT_ID`
- `APPWRITE_API_KEY`
- `APPWRITE_DATABASE_ID`
- `APPWRITE_FLIGHTS_COLLECTION_ID`
- `APPWRITE_PROFILES_COLLECTION_ID`
- `APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID`
- `APPWRITE_BUCKET_ID` (optional)

## Request Body

```json
{
  "studentUserId": "user_123",
  "source_filename": "flight.csv",
  "csv_text": "col1,col2,...",
  "aircraft_ident": "PR-ABC",
  "duration_sec": 3120
}
```
