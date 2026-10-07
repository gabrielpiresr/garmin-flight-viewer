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

## Senhas

A importação SAGA define a senha inicial somente ao criar uma conta. Contas existentes preservam sua senha, inclusive após recuperação ou alteração por um administrador.

A ação `updateUserPassword` recebe `userId` e `password` (mínimo de 8 caracteres). Exige administrador com permissão `users.manage` e perfil do usuário na escola da função. Retorna `ok` e `auditRecorded`, sem retornar senha ou hash. Registra o evento `admin_user_password_updated` com o administrador, usuário e horários da alteração; se a auditoria falhar, a senha continua alterada e `auditRecorded` será `false`.

Validação: `npm run test:passwords` na raiz do projeto. Para disponibilizar a ação do painel, publique a função `admin-users` e o frontend atualizado.
