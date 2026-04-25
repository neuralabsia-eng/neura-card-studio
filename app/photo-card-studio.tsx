"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1620;
const CARD_BORDER = 68;
const COOLDOWN_MS = 60_000;
const EVENT_DATE = "30ABR26";
const DEFAULT_EVENT_UNLOCK_AT = "2026-04-30T00:00:00-04:00";
const EVENT_UNLOCK_AT = process.env.NEXT_PUBLIC_EVENT_UNLOCK_AT ?? DEFAULT_EVENT_UNLOCK_AT;
const DEV_UNLOCK_COOKIE = "js_chile_dev_unlock";
const JS_YELLOW = "#f7df1e";
const INK = "#111111";
const COMIC_WHITE = "#f8f8f2";
const COMIC_GRAY = "#8f8f86";
const PIXEL_FONT: Record<string, string[]> = {
  " ": ["000", "000", "000", "000", "000", "000", "000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
};

type PhotoArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type StatusMessage = {
  tone: "info" | "error" | "success";
  text: string;
};

function isLikelyMobileDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

function getEventUnlockTime() {
  const configuredTime = Date.parse(EVENT_UNLOCK_AT);

  return Number.isNaN(configuredTime) ? Date.parse(DEFAULT_EVENT_UNLOCK_AT) : configuredTime;
}

function hasCookie(name: string) {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie.split("; ").some((cookie) => cookie.startsWith(`${name}=`));
}

function setDevUnlockCookie() {
  document.cookie = `${DEV_UNLOCK_COOKIE}=1; path=/; max-age=2592000; SameSite=Lax`;
}

function clearDevUnlockCookie() {
  document.cookie = `${DEV_UNLOCK_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function luminance(red: number, green: number, blue: number) {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

function paintPixel(data: Uint8ClampedArray, index: number, color: string) {
  const { red, green, blue } = hexToRgb(color);

  data[index] = red;
  data[index + 1] = green;
  data[index + 2] = blue;
}

function getPixelTextUnits(text: string) {
  return [...text.toUpperCase()].reduce((width, character, index) => {
    const glyph = PIXEL_FONT[character] ?? PIXEL_FONT[" "];

    return width + glyph[0].length + (index === text.length - 1 ? 0 : 1);
  }, 0);
}

function drawPixelText(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  maxWidth: number,
  maxScale: number,
  color: string,
) {
  const characters = [...text.toUpperCase()];
  const units = getPixelTextUnits(text);
  const scale = Math.max(1, Math.min(maxScale, Math.floor(maxWidth / units)));
  const width = units * scale;
  const height = 7 * scale;
  let x = centerX - width / 2;
  const y = centerY - height / 2;

  context.fillStyle = color;

  for (const [characterIndex, character] of characters.entries()) {
    const glyph = PIXEL_FONT[character] ?? PIXEL_FONT[" "];

    for (const [rowIndex, row] of glyph.entries()) {
      for (const [columnIndex, pixel] of [...row].entries()) {
        if (pixel === "1") {
          context.fillRect(Math.round(x + columnIndex * scale), Math.round(y + rowIndex * scale), scale, scale);
        }
      }
    }

    x += (glyph[0].length + (characterIndex === characters.length - 1 ? 0 : 1)) * scale;
  }
}

function drawComicVideo(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let drawX = x;
  let drawY = y;
  let drawWidth = width;
  let drawHeight = height;

  if (sourceRatio > targetRatio) {
    drawHeight = width / sourceRatio;
    drawY = y + (height - drawHeight) / 2;
  } else {
    drawWidth = height * sourceRatio;
    drawX = x + (width - drawWidth) / 2;
  }

  const lowWidth = 188;
  const lowHeight = Math.round(lowWidth / sourceRatio);
  const pixelCanvas = document.createElement("canvas");
  pixelCanvas.width = lowWidth;
  pixelCanvas.height = lowHeight;

  const pixelContext = pixelCanvas.getContext("2d");

  if (!pixelContext) {
    return;
  }

  pixelContext.translate(lowWidth, 0);
  pixelContext.scale(-1, 1);
  pixelContext.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, lowWidth, lowHeight);

  const pixels = pixelContext.getImageData(0, 0, lowWidth, lowHeight);
  const source = new Uint8ClampedArray(pixels.data);

  for (let index = 0; index < pixels.data.length; index += 4) {
    const pixel = index / 4;
    const px = pixel % lowWidth;
    const py = Math.floor(pixel / lowWidth);
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    const light = luminance(red, green, blue);
    const warm = red * 0.85 + green * 0.7 - blue * 0.75;
    const right = px < lowWidth - 1 ? (py * lowWidth + px + 1) * 4 : index;
    const bottom = py < lowHeight - 1 ? ((py + 1) * lowWidth + px) * 4 : index;
    const edge =
      Math.abs(light - luminance(source[right], source[right + 1], source[right + 2])) +
      Math.abs(light - luminance(source[bottom], source[bottom + 1], source[bottom + 2]));

    if (edge > 74 || light < 54) {
      paintPixel(pixels.data, index, INK);
    } else if (warm > 165 && light > 86 && light < 226) {
      paintPixel(pixels.data, index, JS_YELLOW);
    } else if (light > 186) {
      paintPixel(pixels.data, index, COMIC_WHITE);
    } else if (light > 104) {
      paintPixel(pixels.data, index, COMIC_GRAY);
    } else {
      paintPixel(pixels.data, index, INK);
    }
  }

  pixelContext.putImageData(pixels, 0, 0);

  context.imageSmoothingEnabled = false;
  context.drawImage(pixelCanvas, drawX, drawY, drawWidth, drawHeight);
  context.imageSmoothingEnabled = true;
}

function drawCardBackground(context: CanvasRenderingContext2D) {
  const photoX = CARD_BORDER;
  const photoY = CARD_BORDER;
  const photoWidth = CARD_WIDTH - CARD_BORDER * 2;
  const photoHeight = CARD_HEIGHT - CARD_BORDER * 2;

  context.fillStyle = INK;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.fillStyle = JS_YELLOW;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.fillStyle = INK;
  context.fillRect(24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48);
  context.fillStyle = JS_YELLOW;
  context.fillRect(44, 44, CARD_WIDTH - 88, CARD_HEIGHT - 88);
  context.fillStyle = INK;
  context.fillRect(56, 56, CARD_WIDTH - 112, CARD_HEIGHT - 112);

  return {
    x: photoX,
    y: photoY,
    width: photoWidth,
    height: photoHeight,
  };
}

function drawCardChrome(context: CanvasRenderingContext2D, photoArea: PhotoArea) {
  const overlayHeight = 285;
  const overlayY = photoArea.y + photoArea.height - overlayHeight;
  const dateWidth = 250;
  const dateHeight = 70;

  context.strokeStyle = JS_YELLOW;
  context.lineWidth = 18;
  context.strokeRect(photoArea.x - 2, photoArea.y - 2, photoArea.width + 4, photoArea.height + 4);
  context.strokeStyle = INK;
  context.lineWidth = 8;
  context.strokeRect(photoArea.x + 18, photoArea.y + 18, photoArea.width - 36, photoArea.height - 36);

  const gradient = context.createLinearGradient(0, overlayY - 90, 0, photoArea.y + photoArea.height);
  gradient.addColorStop(0, "rgba(17, 17, 17, 0)");
  gradient.addColorStop(0.32, "rgba(17, 17, 17, 0.72)");
  gradient.addColorStop(1, "rgba(17, 17, 17, 0.96)");
  context.fillStyle = gradient;
  context.fillRect(photoArea.x, overlayY - 90, photoArea.width, overlayHeight + 90);

  context.fillStyle = JS_YELLOW;
  context.fillRect(photoArea.x + 34, overlayY + 24, photoArea.width - 68, 12);

  context.fillStyle = JS_YELLOW;
  context.fillRect(CARD_WIDTH / 2 - dateWidth / 2, overlayY + 58, dateWidth, dateHeight);
  context.strokeStyle = INK;
  context.lineWidth = 7;
  context.strokeRect(CARD_WIDTH / 2 - dateWidth / 2 + 6, overlayY + 64, dateWidth - 12, dateHeight - 12);

  drawPixelText(context, EVENT_DATE, CARD_WIDTH / 2, overlayY + 93, dateWidth - 36, 7, INK);
  drawPixelText(context, "JS CHILE MEETUP", CARD_WIDTH / 2, overlayY + 185, photoArea.width - 92, 10, JS_YELLOW);

  context.fillStyle = JS_YELLOW;
  context.fillRect(photoArea.x + 34, photoArea.y + photoArea.height - 38, 118, 14);
  context.fillRect(photoArea.x + photoArea.width - 152, photoArea.y + photoArea.height - 38, 118, 14);
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  area: PhotoArea,
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = area.width / area.height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) * 0.38;
  }

  context.drawImage(image, sx, sy, sw, sh, area.x, area.y, area.width, area.height);
}

function drawCard(context: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const photoArea = drawCardBackground(context);

  drawComicVideo(context, video, photoArea.x, photoArea.y, photoArea.width, photoArea.height);
  drawCardChrome(context, photoArea);
}

function drawCardWithPortrait(context: CanvasRenderingContext2D, image: HTMLImageElement) {
  const photoArea = drawCardBackground(context);

  drawCoverImage(context, image, image.naturalWidth, image.naturalHeight, photoArea);
  drawCardChrome(context, photoArea);
}

function captureSourceImage(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = 1024;
  const height = 1024;

  if (!context) {
    return null;
  }

  canvas.width = width;
  canvas.height = height;

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let dx = 0;
  let dy = 0;
  let dw = width;
  let dh = height;

  if (sourceRatio > targetRatio) {
    dh = width / sourceRatio;
    dy = (height - dh) / 2;
  } else {
    dw = height * sourceRatio;
    dx = (width - dw) / 2;
  }

  context.fillStyle = "#0f0f0f";
  context.fillRect(0, 0, width, height);
  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, sourceWidth, sourceHeight, dx, dy, dw, dh);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

export default function PhotoCardStudio() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationInFlightRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loaderStep, setLoaderStep] = useState(0);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState<StatusMessage>({
    tone: "info",
    text: "Toca Activar cámara para que el navegador solicite permiso de acceso.",
  });
  const eventUnlockTime = getEventUnlockTime();
  const gateLocked = now < eventUnlockTime && !devUnlocked;
  const countdown = formatCountdown(eventUnlockTime - now);
  const cooldownRemainingSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;
  const canGenerate = cooldownRemainingSeconds === 0 && !isGenerating;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    await Promise.resolve();

    const isMobile = isLikelyMobileDevice();

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({
        tone: "error",
        text: "Este navegador no permite acceder a la cámara. Prueba con Safari o Chrome actualizado.",
      });
      return;
    }

    try {
      stopCamera();
      setCameraReady(false);
      setSourceImage(null);
      setCapturedImage(null);
      setIsShareDialogOpen(false);
      setStatus({
        tone: "info",
        text: isMobile
          ? "Detecté un dispositivo móvil. Acepta el permiso para abrir la cámara frontal."
          : "Detecté un navegador de escritorio. Acepta el permiso para abrir tu cámara.",
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 960 },
          aspectRatio: { ideal: 4 / 3 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus({
        tone: "success",
        text: "Cámara lista. Centra tu cara y captura la card.",
      });
    } catch {
      setStatus({
        tone: "error",
        text: "No pude abrir la cámara. Revisa permisos del navegador o intenta desde Safari/Chrome móvil.",
      });
    }
  }, [stopCamera]);

  useEffect(() => {
    return stopCamera;
  }, [stopCamera]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);

      if (params.get("dev") === "1") {
        setDevUnlockCookie();
        setDevUnlocked(true);
        return;
      }

      if (params.get("dev_lock") === "1") {
        clearDevUnlockCookie();
        setDevUnlocked(false);
        return;
      }

      setDevUnlocked(hasCookie(DEV_UNLOCK_COOKIE));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!gateLocked) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, [gateLocked]);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const interval = window.setInterval(() => {
      setLoaderStep((step) => (step + 1) % 4);
    }, 260);

    return () => window.clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    const timeout = window.setTimeout(() => {
      setCooldownUntil(null);
      setNow(Date.now());
    }, Math.max(0, cooldownUntil - Date.now()));

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [cooldownUntil]);

  const drawLocalFallback = (video: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    drawCard(context, video);
    setCapturedImage(canvas.toDataURL("image/png"));
  };

  const captureCard = () => {
    const video = videoRef.current;

    if (capturedImage) {
      setCapturedImage(null);
      setIsShareDialogOpen(false);
      setStatus({
        tone: "info",
        text: "Cámara lista. Centra tu cara y vuelve a capturar.",
      });
      return;
    }

    if (cooldownRemainingSeconds > 0) {
      setStatus({
        tone: "info",
        text: `Podrás generar otra imagen en ${cooldownRemainingSeconds}s.`,
      });
      return;
    }

    if (!video || !video.videoWidth || !video.videoHeight) {
      setStatus({
        tone: "error",
        text: "La cámara aún no está lista para capturar.",
      });
      return;
    }

    const source = captureSourceImage(video);

    if (!source) {
      setStatus({
        tone: "error",
        text: "No pude preparar la captura para IA. Intenta nuevamente.",
      });
      return;
    }

    setSourceImage(source);
    setCapturedImage(null);
    void generateAiCard(source, video);
  };

  const generateAiCard = async (imageDataUrl = sourceImage, fallbackVideo?: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const remaining = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)) : 0;

    if (generationInFlightRef.current) {
      return;
    }

    if (remaining > 0) {
      setStatus({
        tone: "info",
        text: `Podrás generar otra imagen en ${remaining}s.`,
      });
      return;
    }

    if (!imageDataUrl || !canvas || !context) {
      setStatus({
        tone: "error",
        text: "Primero captura una foto para generar el arte con IA.",
      });
      return;
    }

    try {
      generationInFlightRef.current = true;
      setIsGenerating(true);
      setStatus({
        tone: "info",
        text: "Generando retrato 16-bit con IA. Esto puede tardar unos segundos.",
      });

      const response = await fetch("/api/generate-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl,
        }),
      });
      const data = (await response.json()) as {
        imageDataUrl?: string;
        error?: string;
        configured?: boolean;
      };

      if (!response.ok || !data.imageDataUrl) {
        if (fallbackVideo) {
          drawLocalFallback(fallbackVideo);
        }

        setStatus({
          tone: data.configured === false ? "info" : "error",
          text: data.error ?? "No pude generar el retrato con IA. Dejé una versión local como respaldo.",
        });
        return;
      }

      const portrait = await loadImage(data.imageDataUrl);
      canvas.width = CARD_WIDTH;
      canvas.height = CARD_HEIGHT;
      drawCardWithPortrait(context, portrait);
      setCapturedImage(canvas.toDataURL("image/png"));
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      setNow(Date.now());
      setStatus({
        tone: "success",
        text: "Retrato 16-bit generado con IA. Podrás generar otro en 60s.",
      });
    } catch {
      if (fallbackVideo) {
        drawLocalFallback(fallbackVideo);
      }

      setStatus({
        tone: "error",
        text: "No pude generar el retrato con IA. Dejé una versión local como respaldo.",
      });
    } finally {
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  };

  const downloadCard = () => {
    if (!capturedImage) {
      return;
    }

    const link = document.createElement("a");
    link.href = capturedImage;
    link.download = "js-chile-meetup-16bit-card.png";
    link.click();
  };

  const openShareDialog = () => {
    if (!capturedImage) {
      return;
    }

    setIsShareDialogOpen(true);
  };

  const shareToWall = async () => {
    if (!capturedImage || isSharing) {
      return;
    }

    try {
      setIsSharing(true);
      setStatus({
        tone: "info",
        text: "Enviando la imagen generada al muro del evento.",
      });

      const response = await fetch("/api/wall", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl: capturedImage,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "No pude enviar la imagen al muro.");
      }

      setIsShareDialogOpen(false);
      setStatus({
        tone: "success",
        text: "Imagen enviada al muro del evento. Gracias por compartir tu card.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "No pude enviar la imagen al muro.",
      });
    } finally {
      setIsSharing(false);
    }
  };

  if (gateLocked) {
    return (
      <main className="flex min-h-dvh flex-col bg-[#0f0f0f] text-white">
        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-5 py-10 text-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#f7df1e]/50 bg-[#f7df1e]/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-[#f7df1e]">
            JS Chile Meetup · {EVENT_DATE}
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-black leading-[0.92] tracking-[-0.06em] text-[#f7df1e] sm:text-7xl">
              Disponible el 30 de abril
            </h1>
            <p className="mx-auto max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
              La cámara y generación de cards se habilitarán automáticamente para el meetup.
            </p>
          </div>

          <div className="grid w-full max-w-xl grid-cols-4 gap-2 font-mono">
            {[
              ["Días", countdown.days],
              ["Horas", countdown.hours],
              ["Min", countdown.minutes],
              ["Seg", countdown.seconds],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4">
                <div className="text-3xl font-black text-[#f7df1e] sm:text-5xl">{value}</div>
                <div className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</div>
              </div>
            ))}
          </div>
        </section>
        <footer className="border-t border-white/10 px-5 py-5 text-center font-mono text-xs leading-6 text-zinc-400 sm:text-sm">
          Creado por{" "}
          <a
            href="https://erasmoh.dev"
            target="_blank"
            rel="noreferrer"
            className="font-black text-[#f7df1e] underline decoration-[#f7df1e]/40 underline-offset-4 transition hover:text-yellow-200"
          >
            @ErasmoHernandez
          </a>
          , con amor para la comunidad JS Chile ·{" "}
          <a
            href="https://erasmoh.dev"
            target="_blank"
            rel="noreferrer"
            className="font-black text-white underline decoration-white/30 underline-offset-4 transition hover:text-[#f7df1e]"
          >
            erasmoh.dev
          </a>
        </footer>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#0f0f0f] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-6 sm:px-8 lg:grid lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:py-10">
        <div className="flex flex-col gap-5">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#f7df1e]/50 bg-[#f7df1e]/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.24em] text-[#f7df1e]">
            JS Chile Meetup
          </div>
          <div className="space-y-4">
            <h1 className="max-w-xl text-5xl font-black leading-[0.92] tracking-[-0.06em] text-[#f7df1e] sm:text-7xl">
              Tu cara en una card 16-bit JS
            </h1>
            <p className="max-w-lg text-base leading-7 text-zinc-300 sm:text-lg">
              Usa la cámara frontal, captura tu foto y genera automáticamente un retrato 16-bit pixel con IA para tu card JavaScript.
            </p>
          </div>

          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              status.tone === "error"
                ? "border-red-400/40 bg-red-500/10 text-red-100"
                : status.tone === "success"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                  : "border-[#f7df1e]/30 bg-[#f7df1e]/10 text-yellow-100"
            }`}
          >
            {status.text}
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={startCamera}
                className="rounded-xl bg-[#f7df1e] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:scale-[1.01] hover:bg-yellow-300"
              >
                {cameraReady ? "Reactivar cámara" : "Activar cámara"}
              </button>
              <button
                type="button"
                onClick={captureCard}
                disabled={!cameraReady || !canGenerate}
                className="rounded-xl border-2 border-[#f7df1e] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#f7df1e] transition hover:scale-[1.01] hover:bg-[#f7df1e] hover:text-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent disabled:hover:text-[#f7df1e]"
              >
                {isGenerating
                  ? "Generando..."
                  : cooldownRemainingSeconds > 0
                    ? `${cooldownRemainingSeconds}s`
                    : capturedImage
                      ? "Nueva captura"
                      : "Capturar"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={downloadCard}
                disabled={!capturedImage}
                className="rounded-lg border border-[#f7df1e] px-3 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-[#f7df1e] transition hover:bg-[#f7df1e] hover:text-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#f7df1e]"
              >
                Descargar
              </button>
              <button
                type="button"
                onClick={openShareDialog}
                disabled={!capturedImage || isSharing}
                className="rounded-lg border border-white/20 px-3 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:border-white/50 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {isSharing ? "Enviando..." : "Enviar al muro"}
              </button>
            </div>
            {cooldownRemainingSeconds > 0 && (
              <p className="text-xs font-medium text-zinc-400">
                Límite activo: podrás generar otra imagen en {cooldownRemainingSeconds}s.
              </p>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[430px] lg:max-w-[460px]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-3 shadow-2xl">
            <div className="relative aspect-[2/3] overflow-hidden rounded-[1.55rem] border-[10px] border-[#f7df1e] bg-black font-mono">
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full scale-x-[-1] bg-black object-contain"
                muted
                playsInline
                autoPlay
                onCanPlay={() => setCameraReady(true)}
              />
              {capturedImage ? (
                <Image
                  src={capturedImage}
                  alt="Card final 16-bit de JS Chile Meetup"
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pb-5 pt-20 text-center">
                  <span className="mb-2 inline-flex bg-[#f7df1e] px-3 py-1 text-xs font-black tracking-[0.18em] text-black">
                    {EVENT_DATE}
                  </span>
                  <p className="text-xl font-black tracking-[0.02em] text-[#f7df1e]">
                    JS CHILE MEETUP
                  </p>
                </div>
              )}
              {isGenerating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/72 px-8 text-center backdrop-blur-[2px]">
                  <div className="flex items-center gap-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <span
                        key={index}
                        className={`h-3.5 w-3.5 rounded-full transition-colors duration-200 ${
                          loaderStep === index
                            ? "bg-[#f7df1e]"
                            : (loaderStep + index) % 2 === 0
                              ? "bg-white"
                              : "bg-zinc-600"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f7df1e]">
                    Generando retrato 16-bit
                  </p>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_4px_rgba(0,0,0,0.7)]" />
            </div>
            <p className="mt-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
              {capturedImage ? "Resultado final" : isGenerating ? "Generando" : "Cámara frontal"}
            </p>
          </div>
        </div>
      </section>
      <footer className="border-t border-white/10 px-5 py-5 text-center font-mono text-xs leading-6 text-zinc-400 sm:text-sm">
        Creado por{" "}
        <a
          href="https://erasmoh.dev"
          target="_blank"
          rel="noreferrer"
          className="font-black text-[#f7df1e] underline decoration-[#f7df1e]/40 underline-offset-4 transition hover:text-yellow-200"
        >
          @ErasmoHernandez
        </a>
        , con amor para la comunidad JS Chile ·{" "}
        <a
          href="https://erasmoh.dev"
          target="_blank"
          rel="noreferrer"
          className="font-black text-white underline decoration-white/30 underline-offset-4 transition hover:text-[#f7df1e]"
        >
          erasmoh.dev
        </a>
      </footer>
      {isShareDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-wall-title"
            className="w-full max-w-md rounded-[2rem] border border-[#f7df1e]/50 bg-[#111] p-6 text-white shadow-2xl"
          >
            <div className="space-y-4">
              <div className="inline-flex rounded-full bg-[#f7df1e] px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-black">
                Confirmación
              </div>
              <h2 id="share-wall-title" className="text-2xl font-black leading-tight text-[#f7df1e]">
                Enviar al muro
              </h2>
              <p className="text-sm leading-6 text-zinc-200">
                ¿Autorizas a compartir la imagen generada en el muro del evento? Quedará almacenada SOLO LA IMAGEN
                GENERADA, la foto de tu rostro real nunca sale de tu dispositivo.
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsShareDialogOpen(false)}
                disabled={isSharing}
                className="rounded-xl border border-white/20 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={shareToWall}
                disabled={isSharing}
                className="rounded-xl bg-[#f7df1e] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSharing ? "Enviando..." : "Sí, enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}
