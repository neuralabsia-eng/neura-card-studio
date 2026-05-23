# Neura Card Studio

Fork de `erasmoh/caritas-16bit` (MIT). App de cámara + retrato AI generado + muro realtime,
rebrandeada con identidad Neura.Lab para eventos universitarios.

## Stack

- Next.js 16.2.4 (App Router, RSC) + React 19.2.4 + TypeScript 5
- Tailwind CSS v4 — configurado via `@theme inline` en `app/globals.css` (SIN `tailwind.config.*`)
- Supabase (Postgres + Storage + Realtime) — opcional
- Vercel AI Gateway (Gemini 3 Pro Image) → fallback OpenAI gpt-image-1 — opcional

## IMPORTANTE: Next 16 ≠ Next que conoces

Lee `node_modules/next/dist/docs/` antes de modificar layout, routing o APIs.
Especialmente: `searchParams` es `Promise` en App Router de Next 16.

## Arquitectura

- `app/photo-card-studio.tsx`: componente cliente principal (~700 LOC tras refactor). Cámara,
  UI, gate, share dialog. Importa pipeline canvas desde `app/lib/canvas/draw-card.ts`.
- `app/lib/canvas/draw-card.ts`: todo el pipeline canvas (drawNeuralVideo, drawCardBackground,
  drawCardChrome, drawHudText, drawCoverImage, loadImage, captureSourceImage).
- `app/lib/theme.ts`: source of truth de hex Neura para canvas API.
- `app/lib/event-copy.ts`: todos los strings del UI centralizados.
- `app/lib/event-gate.ts`: lógica de gate compartida entre cliente y rutas API.
- `app/api/generate-card/route.ts`: prompt AI neural + chain Gateway → OpenAI.
- `app/api/wall/route.ts`: POST sube a Supabase Storage + crea row. Gate aplicado.
- `app/muro/`: muro realtime. Modo `?presenter=1&live=1` para Google Meets.
- `supabase/schema.sql`: schema idempotente, bucket `wall-images`, RLS, realtime.

## Identidad Neura.Lab

Brand: #7C3AED | Glow: #A855F7 | Deep: #C026D3 | BG: #0A0E1A | Surface: #0F131F

Fuentes: Space Grotesk (display), Inter (body), ui-monospace (HUD).

## Tokens Tailwind: bg-brand, text-brand-glow, bg-bg, bg-surface, .text-gradient-brand

## Modo local: sin keys, download PNG funciona, /muro muestra empty state, fallback canvas.

## Evento: NEXT_PUBLIC_EVENT_UNLOCK_AT en .env.local. Dev bypass: /?dev=1
## Remotes: origin=neuralabsia-eng/neura-card-studio | upstream=erasmoh/caritas-16bit
## Crédito: Original por @ErasmoHernandez. Rebrand por Neura.Lab. MIT License.
