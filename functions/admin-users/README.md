# Admin Users Function

Appwrite Function usada pelo painel admin para listar usuarios, consolidar voos e alterar permissoes.

## Variaveis

- `APPWRITE_API_KEY`
- `APPWRITE_DATABASE_ID`
- `APPWRITE_PROFILES_COLLECTION_ID`
- `APPWRITE_FLIGHTS_COLLECTION_ID`
- `APPWRITE_WEEKLY_PLANS_COLLECTION_ID`
- `APPWRITE_INSTRUCTOR_PREFS_COLLECTION_ID`

Tambem usa `APPWRITE_FUNCTION_API_ENDPOINT` e `APPWRITE_FUNCTION_PROJECT_ID`, fornecidas pelo runtime do Appwrite.

No frontend, configure:

```env
VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID=...
VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID=...
```
