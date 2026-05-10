# GitHub, Supabase, Vercel

## 1. GitHub

No diretório do projeto:

```bash
git init
git add .
git commit -m "Initial commit: Garmin flight viewer with Supabase"
```

Crie um repositório vazio em [github.com/new](https://github.com/new), depois:

```bash
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git branch -M main
git push -u origin main
```

## 2. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor** → cole o conteúdo de `supabase/migrations/001_flights.sql` → Run.
3. **Project Settings → API**: copie `Project URL` e `anon public` key.
4. **Authentication → Providers**: habilite Email; em desenvolvimento você pode desativar “Confirm email” em Authentication → Providers → Email (opcional).

Variáveis locais (arquivo `.env.local`, não versionado):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## 3. Vercel

1. Importe o repositório GitHub em [vercel.com](https://vercel.com).
2. Framework: **Vite** (detectado automaticamente).
3. **Environment Variables** (Production + Preview):

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

4. Deploy. O ficheiro `vercel.json` redireciona rotas para `index.html` (SPA).

## Limites

- O CSV completo é guardado em `flights.csv_text`. Ficheiros muito grandes podem falhar pelo limite de linha/Payload; nesse caso considere comprimir ou guardar só metadados + URL de storage.
