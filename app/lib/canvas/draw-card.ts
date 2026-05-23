// Pipeline de render canvas — Neura Card Studio
// Extraído de photo-card-studio.tsx para aislamiento y mantenibilidad.

import { BRAND, BRAND_GRADIENT_STOPS, NEURAL_PALETTE } from "../theme";
import { EVENT_COPY } from "../event-copy";

// ─── Dimensiones de la card ───────────────────────────────────────────────────
export const CARD_WIDTH  = 1080;
export const CARD_HEIGHT = 1620;
export const CARD_BORDER = 68;

export type PhotoArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// ─── Helpers pixel ────────────────────────────────────────────────────────────

function luminance(r: number, g: number, b: number) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function hexToRgb(hex: string) {
  const v = Number.parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function paintPixel(data: Uint8ClampedArray, i: number, hex: string) {
  const { r, g, b } = hexToRgb(hex);
  data[i] = r; data[i + 1] = g; data[i + 2] = b;
}

// ─── Font loading ─────────────────────────────────────────────────────────────

export async function preloadFonts() {
  if (typeof document === "undefined") return;
  const sizes = [
    "700 88px", "700 52px", "700 48px", "700 34px",
    "600 32px", "600 22px",
    "500 24px", "500 22px", "500 20px",
  ];
  await Promise.all(sizes.map((s) => document.fonts.load(`${s} 'Space Grotesk', sans-serif`)));
}

// ─── HUD text renderer (replaces pixel font) ──────────────────────────────────

type HudTextOptions = {
  font?: string;
  color?: string;
  letterSpacing?: number;
  align?: CanvasTextAlign;
  glow?: boolean;
};

function drawHudText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  opts: HudTextOptions = {},
) {
  const {
    font = "600 32px 'Space Grotesk', sans-serif",
    color = BRAND.text,
    letterSpacing = 4,
    align = "center",
    glow = false,
  } = opts;

  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  if (glow) {
    ctx.shadowColor = BRAND.brandGlow;
    ctx.shadowBlur = 24;
  }

  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + letterSpacing);
  const totalWidth = widths.reduce((s, w) => s + w, 0) - letterSpacing;
  let x = align === "center" ? cx - totalWidth / 2
         : align === "right"  ? cx - totalWidth : cx;

  chars.forEach((c, i) => {
    ctx.fillText(c, x, cy);
    x += widths[i];
  });

  ctx.restore();
}

// ─── Neura.Lab logo mark (drawn as canvas path — no external asset needed) ────

function drawNeuraLogoMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
) {
  const archR = size * 0.52;
  const archCy = cy + size * 0.38;
  const grad = ctx.createLinearGradient(cx - archR, cy, cx + archR, cy + size);
  grad.addColorStop(0, "#7C3AED");
  grad.addColorStop(0.5, "#A855F7");
  grad.addColorStop(1, "#C026D3");

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = size * 0.17;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, archCy, archR, Math.PI * 1.08, Math.PI * 1.92, false);
  ctx.stroke();

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.64, size * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.85, size * 0.085, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Neural video render (replaces drawComicVideo) ───────────────────────────

export function drawNeuralVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sw = video.videoWidth;
  const sh = video.videoHeight;
  if (sw === 0 || sh === 0) return;

  // Cover crop: fill entire photo area, cropping excess video edges
  const sRatio = sw / sh;
  const tRatio = width / height;
  let srcX = 0, srcY = 0, srcW = sw, srcH = sh;
  if (sRatio > tRatio) {
    // video wider than target → crop sides, keep full height
    srcW = sh * tRatio;
    srcX = (sw - srcW) / 2;
  } else {
    // video taller than target → crop bottom, bias face toward top
    srcH = sw / tRatio;
    srcY = (sh - srcH) * 0.28;
  }

  // Low-res canvas at the same aspect ratio as the photo area
  const lowW = 192;
  const lowH = Math.round(lowW * height / width);
  const pxCv = document.createElement("canvas");
  pxCv.width = lowW; pxCv.height = lowH;
  const pctx = pxCv.getContext("2d");
  if (!pctx) return;

  // Mirror selfie + pre-blur + contrast boost before quantizing
  pctx.translate(lowW, 0);
  pctx.scale(-1, 1);
  pctx.filter = "blur(2px) contrast(1.45) brightness(1.18)";
  pctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, lowW, lowH);
  pctx.filter = "none";

  const pixels = pctx.getImageData(0, 0, lowW, lowH);
  const src = new Uint8ClampedArray(pixels.data);

  for (let i = 0; i < pixels.data.length; i += 4) {
    const px_ = (i / 4) % lowW;
    const py_ = Math.floor(i / 4 / lowW);
    const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
    const light = luminance(r, g, b);

    const ri = px_ < lowW - 1 ? (py_ * lowW + px_ + 1) * 4 : i;
    const bi = py_ < lowH - 1 ? ((py_ + 1) * lowW + px_) * 4 : i;
    const edge =
      Math.abs(light - luminance(src[ri], src[ri + 1], src[ri + 2])) +
      Math.abs(light - luminance(src[bi], src[bi + 1], src[bi + 2]));

    if (edge > 48) {
      paintPixel(pixels.data, i, NEURAL_PALETTE.brand);
    } else if (light < 70) {
      paintPixel(pixels.data, i, NEURAL_PALETTE.ink);
    } else if (light > 148) {
      paintPixel(pixels.data, i, NEURAL_PALETTE.glow);
    } else {
      paintPixel(pixels.data, i, NEURAL_PALETTE.midtone);
    }
  }

  pctx.putImageData(pixels, 0, 0);

  // Scale up: pixelated neural scan aesthetic
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pxCv, x, y, width, height);
  ctx.imageSmoothingEnabled = true;

  // Scanline overlay for HUD / CRT feel
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = BRAND.bg;
  for (let sy = y; sy < y + height; sy += 3) {
    ctx.fillRect(x, sy, width, 1);
  }
  ctx.restore();
}

// ─── Card background (Neura neural style) ────────────────────────────────────

export function drawCardBackground(ctx: CanvasRenderingContext2D): PhotoArea {
  const px = CARD_BORDER, py = CARD_BORDER;
  const pw = CARD_WIDTH - CARD_BORDER * 2;
  const ph = CARD_HEIGHT - CARD_BORDER * 2;

  // Solid dark background
  ctx.fillStyle = BRAND.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Brand gradient diagonal overlay (very subtle)
  const gDiag = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  BRAND_GRADIENT_STOPS.forEach(([stop, color]) => {
    gDiag.addColorStop(stop, color + "18"); // 9% alpha
  });
  ctx.fillStyle = gDiag;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Subtle 32px grid (neural / circuit aesthetic)
  ctx.strokeStyle = BRAND.brand + "0D"; // ~5% alpha
  ctx.lineWidth = 1;
  for (let gx = 0; gx < CARD_WIDTH; gx += 32) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CARD_HEIGHT); ctx.stroke();
  }
  for (let gy = 0; gy < CARD_HEIGHT; gy += 32) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CARD_WIDTH, gy); ctx.stroke();
  }

  // Photo area — clear with surface color
  ctx.fillStyle = BRAND.surface;
  ctx.fillRect(px, py, pw, ph);

  return { x: px, y: py, width: pw, height: ph };
}

// ─── Card chrome overlay — shareable badge + Neura branding ─────────────────

export function drawCardChrome(ctx: CanvasRenderingContext2D, area: PhotoArea) {
  const { x, y, width, height } = area;
  const overlayH = 420;
  const overlayY = y + height - overlayH;

  // 1. Glow border around photo area
  ctx.save();
  ctx.shadowColor = BRAND.brandGlow;
  ctx.shadowBlur = 40;
  ctx.strokeStyle = BRAND.brandGlow;
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.restore();

  // 2. HUD corner brackets
  const bLen = 60, bW = 6;
  ctx.strokeStyle = BRAND.brandGlow;
  ctx.lineWidth = bW;
  ([
    [x, y], [x + width, y], [x, y + height], [x + width, y + height],
  ] as const).forEach(([cx_, cy_], i) => {
    const sx = i % 2 === 0 ? 1 : -1;
    const sy = i < 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx_ + sx * bLen, cy_);
    ctx.lineTo(cx_, cy_);
    ctx.lineTo(cx_, cy_ + sy * bLen);
    ctx.stroke();
  });

  // 3. Outer card border
  ctx.strokeStyle = BRAND.brand + "60";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, CARD_WIDTH - 4, CARD_HEIGHT - 4);

  // 4. Bottom gradient overlay — dark bg for text legibility
  const gOver = ctx.createLinearGradient(0, overlayY - 80, 0, y + height);
  gOver.addColorStop(0, "rgba(10,14,26,0)");
  gOver.addColorStop(0.22, "rgba(10,14,26,0.90)");
  gOver.addColorStop(1, "rgba(10,14,26,0.98)");
  ctx.fillStyle = gOver;
  ctx.fillRect(x, overlayY - 80, width, overlayH + 80);

  // 5. Neura.Lab logo mark + wordmark
  const logoSize = 54;
  const logoRowCy = overlayY + 20 + logoSize / 2;
  drawNeuraLogoMark(ctx, x + 72 + logoSize / 2, overlayY + 20, logoSize);

  ctx.save();
  ctx.font = "700 34px 'Space Grotesk', sans-serif";
  ctx.fillStyle = BRAND.brandGlow;
  ctx.shadowColor = BRAND.brandGlow;
  ctx.shadowBlur = 14;
  ctx.textBaseline = "middle";
  ctx.fillText("NEURA.LAB", x + 72 + logoSize + 14, logoRowCy);
  ctx.restore();

  // University name — right-aligned
  ctx.save();
  ctx.font = "500 21px 'Space Grotesk', sans-serif";
  ctx.fillStyle = BRAND.textMuted;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(EVENT_COPY.universityName, x + width - 52, logoRowCy);
  ctx.restore();

  // 6. Gradient separator
  const gLine = ctx.createLinearGradient(x + 40, 0, x + width - 40, 0);
  BRAND_GRADIENT_STOPS.forEach(([s, c]) => gLine.addColorStop(s, c));
  ctx.fillStyle = gLine;
  ctx.fillRect(x + 48, overlayY + 88, width - 96, 2);

  // 7. Achievement statement — shareable, first-person
  drawHudText(ctx, EVENT_COPY.cardStatement1, CARD_WIDTH / 2, overlayY + 146, {
    font: "700 50px 'Space Grotesk', sans-serif",
    color: BRAND.text,
    letterSpacing: 2,
  });

  // "AGENTE IA" — big glow highlight
  ctx.save();
  ctx.font = "700 86px 'Space Grotesk', sans-serif";
  ctx.fillStyle = BRAND.brandGlow;
  ctx.shadowColor = BRAND.brandGlow;
  ctx.shadowBlur = 36;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(EVENT_COPY.cardStatement2, CARD_WIDTH / 2, overlayY + 230);
  ctx.restore();

  // 8. Thin separator
  ctx.fillStyle = BRAND.brand + "45";
  ctx.fillRect(x + 80, overlayY + 284, width - 160, 1);

  // 9. Event full name
  drawHudText(ctx, EVENT_COPY.eventFullName, CARD_WIDTH / 2, overlayY + 315, {
    font: "500 22px 'Space Grotesk', sans-serif",
    color: BRAND.textMuted,
    letterSpacing: 0.4,
  });

  // 10. Date + platform
  drawHudText(ctx, EVENT_COPY.cardDateLine, CARD_WIDTH / 2, overlayY + 350, {
    font: "500 19px 'Space Grotesk', sans-serif",
    color: BRAND.textFaint,
    letterSpacing: 0.8,
  });

  // 11. Social handles — drives traffic
  drawHudText(ctx, EVENT_COPY.socialLine, CARD_WIDTH / 2, overlayY + 388, {
    font: "600 21px 'Space Grotesk', sans-serif",
    color: BRAND.brandGlow,
    letterSpacing: 1.2,
  });

  // 12. Tick marks (outer card edges)
  ctx.fillStyle = BRAND.brand + "80";
  [0.15, 0.35, 0.65, 0.85].forEach((t) => {
    const tx = CARD_WIDTH * t;
    ctx.fillRect(tx - 1, 0, 2, 16);
    ctx.fillRect(tx - 1, CARD_HEIGHT - 16, 2, 16);
  });

  // 13. Portrait halo (top area radial glow)
  const gHalo = ctx.createRadialGradient(
    x + width / 2, y + height * 0.28, 50,
    x + width / 2, y + height * 0.28, width * 0.7,
  );
  gHalo.addColorStop(0, BRAND.brandGlow + "1A");
  gHalo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gHalo;
  ctx.fillRect(x, y, width, height * 0.55);
}

// ─── Cover-fit image into area ────────────────────────────────────────────────

export function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  srcW: number,
  srcH: number,
  area: PhotoArea,
) {
  const sRatio = srcW / srcH;
  const tRatio = area.width / area.height;
  let sx = 0, sy = 0, sw = srcW, sh = srcH;

  if (sRatio > tRatio) {
    sw = srcH * tRatio;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / tRatio;
    sy = (srcH - sh) * 0.38;
  }

  ctx.drawImage(image, sx, sy, sw, sh, area.x, area.y, area.width, area.height);
}

// ─── Full card render functions ───────────────────────────────────────────────

export function drawCard(ctx: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const area = drawCardBackground(ctx);
  drawNeuralVideo(ctx, video, area.x, area.y, area.width, area.height);
  drawCardChrome(ctx, area);
}

export function drawCardWithPortrait(ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
  const area = drawCardBackground(ctx);
  drawCoverImage(ctx, image, image.naturalWidth, image.naturalHeight, area);
  drawCardChrome(ctx, area);
}

// ─── Capture source selfie as JPEG data URL ───────────────────────────────────

export function captureSourceImage(video: HTMLVideoElement): string | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  // Portrait 3:4 crop zoomed 1.5x into center-top — face fills more of the frame
  const W = 768, H = 1024;
  if (!ctx) return null;

  canvas.width = W; canvas.height = H;
  const sw = video.videoWidth, sh = video.videoHeight;

  // 1.5x zoom: sample only the center 2/3 of the video
  const zoom = 1.5;
  const cropW = sw / zoom;
  const cropH = sh / zoom;
  // Horizontal center, vertical bias toward top (where the face is)
  const srcX = (sw - cropW) / 2;
  const srcY = (sh - cropH) * 0.25;

  ctx.fillStyle = BRAND.bg;
  ctx.fillRect(0, 0, W, H);
  // Mirror selfie horizontally
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, srcX, srcY, cropW, cropH, 0, 0, W, H);

  return canvas.toDataURL("image/jpeg", 0.95);
}

// ─── Load image from URL ──────────────────────────────────────────────────────

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
