# Garmin Flight Video Helper

App desktop leve (system tray) que processa vídeos localmente com FFmpeg e faz upload para Cloudflare R2.

## Pré-requisitos

- Windows 10/11
- Rust toolchain (`rustup.rs`)
- Node.js 18+ (apenas para o CLI do Tauri)
- WebView2 (incluso no Windows 11; Win10 baixa automaticamente)

## Setup de desenvolvimento

```bash
cd tauri-video-helper

# Instalar CLI do Tauri
npm install

# Baixar FFmpeg estático para Windows
# Acesse: https://github.com/BtbN/FFmpeg-Builds/releases
# Baixe: ffmpeg-master-latest-win64-gpl.zip
# Extraia e copie ffmpeg.exe e ffprobe.exe para:
cp /caminho/ffmpeg.exe src-tauri/ffmpeg.exe
cp /caminho/ffprobe.exe src-tauri/ffprobe.exe

# Adicionar watermark da escola (opcional)
cp /caminho/watermark.png src-tauri/watermark.png
# Se não existir, o step de watermark é pulado automaticamente.

# Rodar em modo dev
npm run dev
```

## Build para distribuição

```bash
npm run build
# Gera instalador em: src-tauri/target/release/bundle/
```

## Como funciona

1. Ao iniciar, aparece um ícone na bandeja do sistema (system tray)
2. Fica escutando em `http://localhost:7842`
3. O app web detecta automaticamente se o helper está rodando
4. Quando o instrutor clica "Selecionar vídeos", o helper abre um diálogo nativo de seleção de arquivos
5. O helper executa o pipeline FFmpeg: concat → watermark → compress
6. Faz upload direto para Cloudflare R2 via presigned URL
7. Atualiza o status no Appwrite

## Porta

`localhost:7842` — certifique-se de que nenhum firewall bloqueia conexões locais nesta porta.

## Watermark

Coloque um arquivo `watermark.png` (PNG transparente) em `src-tauri/watermark.png` antes de buildar.
O watermark é posicionado no canto inferior direito com margem de 20px.
Se o arquivo não existir, o step de watermark é pulado silenciosamente.
