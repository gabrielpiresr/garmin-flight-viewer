# Feed de avisos

## Setup Appwrite

1. Configure no ambiente local:
   - `APPWRITE_ENDPOINT`
   - `APPWRITE_PROJECT_ID`
   - `APPWRITE_API_KEY`
   - `APPWRITE_DATABASE_ID`
2. Execute:

```bash
npm run appwrite:setup-notices
```

3. Copie os valores para `.env.local`:
   - `VITE_APPWRITE_NOTICES_COL_ID`
   - `VITE_APPWRITE_NOTICES_BUCKET_ID` (opcional)

Se `VITE_APPWRITE_NOTICES_BUCKET_ID` não for informado, o módulo reutiliza `VITE_APPWRITE_BUCKET_ID`.

## Permissões esperadas

- Coleção `notices`: leitura para usuários autenticados, CRUD para label `admin`.
- Banner (Storage): o upload usa permissões para leitura por usuários autenticados e gestão por label `admin`.

## Onde fica na UI

- Admin: aba `Avisos` em `AdminLayout`.
- Aluno: `NoticeFeed` na home, abaixo dos cards de menu, ocupando 50% no desktop.
