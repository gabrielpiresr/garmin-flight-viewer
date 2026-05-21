# video-upload-worker

Cloudflare Worker que gera presigned URLs para upload direto no R2.

## Setup

### 1. Criar bucket R2

No dashboard da Cloudflare → R2 → Create bucket → nome: `flight-videos`

### 2. Criar R2 API Token

Cloudflare → My Profile → API Tokens → Create Token → R2 read & write

Anote: `Access Key ID` e `Secret Access Key`

### 3. Ativar acesso público no bucket (para download)

R2 → flight-videos → Settings → Public Access → Allow Access
Anote a URL pública (ex: `https://pub-xxxx.r2.dev`)

### 4. Deploy do worker

```bash
cd workers/video-upload-worker
npx wrangler deploy
```

### 5. Configurar secrets

```bash
npx wrangler secret put WORKER_SECRET
# Digite uma senha aleatória forte

npx wrangler secret put R2_ACCOUNT_ID
# Seu Cloudflare Account ID (Settings → Overview)

npx wrangler secret put R2_BUCKET_NAME
# flight-videos

npx wrangler secret put R2_PUBLIC_URL
# https://pub-xxxx.r2.dev  (sem barra no final)

npx wrangler secret put R2_ACCESS_KEY_ID
# Access Key ID do token R2

npx wrangler secret put R2_SECRET_ACCESS_KEY
# Secret Access Key do token R2
```

### 6. Reconciliar vídeos presos em "processing"

Após deploy com `POST /storage/list`:

```bash
# no root do projeto (com .env.local + APPWRITE_API_KEY)
npm run videos:reconcile
npm run videos:reconcile:watch   # repete a cada 60s
```

### 7. Atualizar .env.local do app web

```env
VITE_CF_WORKER_URL=https://video-upload.SEU-SUBDOMINIO.workers.dev
# O frontend nao recebe o segredo.
# Configure WORKER_SECRET somente no Worker e na Appwrite Function admin-users.
```
