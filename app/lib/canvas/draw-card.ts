// Pipeline de render canvas — Neura Card Studio
// Extraído de photo-card-studio.tsx para aislamiento y mantenibilidad.

import { BRAND, BRAND_GRADIENT_STOPS, NEURAL_PALETTE } from "../theme";

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
  await Promise.all([
    document.fonts.load("700 48px 'Space Grotesk', sans-serif"),
    document.fonts.load("600 32px 'Space Grotesk', sans-serif"),
    document.fonts.load("500 20px 'Space Grotesk', sans-serif"),
  ]);
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
  let x = align === "center" ? cx - totalWidth / 2 : cx;

  chars.forEach((c, i) => {
    ctx.fillText(c, x, cy);
    x += widths[i];
  });

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

// ─── Card chrome overlay (HUD aesthetic) ─────────────────────────────────────

export function drawCardChrome(ctx: CanvasRenderingContext2D, area: PhotoArea, eventLabel = "NEURA.LAB") {
  const { x, y, width, height } = area;
  const overlayH = 300;
  const overlayY = y + height - overlayH;

  // 1. Glow border around photo area
  ctx.save();
  ctx.shadowColor = BRAND.brandGlow;
  ctx.shadowBlur = 40;
  ctx.strokeStyle = BRAND.brandGlow;
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.restore();

  // 2. HUD corner brackets ([ ] style, each 60x60 px)
  const bLen = 60, bW = 6;
  ctx.strokeStyle = BRAND.brandGlow;
  ctx.lineWidth = bW;
  const corners = [
    [x, y], [x + width, y], [x, y + height], [x + width, y + height],
  ] as const;
  corners.forEach(([cx_, cy_], i) => {
    const sx = i % 2 === 0 ? 1 : -1;
    const sy = i < 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx_ + sx * bLen, cy_);
    ctx.lineTo(cx_, cy_);
    ctx.lineTo(cx_, cy_ + sy * bLen);
    ctx.stroke();
  });

  // 3. Outer card border — subtle brand glow
  ctx.strokeStyle = BRAND.brand + "60";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, CARD_WIDTH - 4, CARD_HEIGHT - 4);

  // 4. Bottom gradient overlay for legibility
  const gOver = ctx.createLinearGradient(0, overlayY - 60, 0, y + height);
  gOver.addColorStop(0, "rgba(10,14,26,0)");
  gOver.addColorStop(0.3, "rgba(10,14,26,0.72)");
  gOver.addColorStop(1, "rgba(10,14,26,0.97)");
  ctx.fillStyle = gOver;
  ctx.fillRect(x, overlayY - 60, width, overlayH + 60);

  // 5. Separator line
  const gLine = ctx.createLinearGradient(x + 40, 0, x + width - 40, 0);
  BRAND_GRADIENT_STOPS.forEach(([stop, color]) => gLine.addColorStop(stop, color));
  ctx.fillStyle = gLine;
  ctx.fillRect(x + 60, overlayY + 10, width - 120, 3);

  // 6. Date badge (top center)
  const badgeW = 240, badgeH = 56, badgeX = CARD_WIDTH / 2 - badgeW / 2, badgeY = overlayY + 28;
  ctx.fillStyle = BRAND.surface;
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  ctx.strokeStyle = BRAND.brandGlow;
  ctx.lineWidth = 2;
  ctx.strokeRect(badgeX + 3, badgeY + 3, badgeW - 6, badgeH - 6);

  drawHudText(ctx, "NEURA.LAB", CARD_WIDTH / 2, badgeY + badgeH / 2, {
    font: "700 28px 'Space Grotesk', sans-serif",
    color: BRAND.brandGlow,
    letterSpacing: 6,
    glow: true,
  });

  // 7. Event label / tagline
  drawHudText(ctx, eventLabel + " // AGENT ACTIVATED", CARD_WIDTH / 2, overlayY + 128, {
    font: "500 26px 'Space Grotesk', sans-serif",
    color: BRAND.textMuted,
    letterSpacing: 3,
  });

  // 8. Tick marks (outer card edges — HUD dial aesthetic)
  ctx.fillStyle = BRAND.brand + "80";
  const tickPositions = [0.15, 0.35, 0.65, 0.85];
  tickPositions.forEach((t) => {
    const tx = CARD_WIDTH * t;
    ctx.fillRect(tx - 1, 0, 2, 16);
    ctx.fillRect(tx - 1, CARD_HEIGHT - 16, 2, 16);
  });

  // 9. Small radial glow at top (portrait halo)
  const gHalo = ctx.createRadialGradient(
    x + width / 2, y + height * 0.3,
    50,
    x + width / 2, y + height * 0.3,
    width * 0.7,
  );
  gHalo.addColorStop(0, BRAND.brandGlow + "20");
  gHalo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gHalo;
  ctx.fillRect(x, y, width, height * 0.6);
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

export function drawCard(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, eventLabel?: string) {
  const area = drawCardBackground(ctx);
  drawNeuralVideo(ctx, video, area.x, area.y, area.width, area.height);
  drawCardChrome(ctx, area, eventLabel);
}

export function drawCardWithPortrait(ctx: CanvasRenderingContext2D, image: HTMLImageElement, eventLabel?: string) {
  const area = drawCardBackground(ctx);
  drawCoverImage(ctx, image, image.naturalWidth, image.naturalHeight, area);
  drawCardChrome(ctx, area, eventLabel);
}

// ─── Capture source selfie as JPEG data URL ───────────────────────────────────

export function captureSourceImage(video: HTMLVideoElement): string | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const W = 1024, H = 1024;
  if (!ctx) return null;

  canvas.width = W; canvas.height = H;
  const sw = video.videoWidth, sh = video.videoHeight;
  const sRatio = sw / sh;
  const tRatio = W / H;
  let dx = 0, dy = 0, dw = W, dh = H;

  if (sRatio > tRatio) {
    dh = W / sRatio; dy = (H - dh) / 2;
  } else {
    dw = H * sRatio; dx = (W - dw) / 2;
  }

  ctx.fillStyle = BRAND.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, sw, sh, dx, dy, dw, dh);

  return canvas.toDataURL("image/jpeg", 0.92);
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
