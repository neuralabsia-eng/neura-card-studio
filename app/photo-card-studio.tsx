"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  drawCard,
  drawCardWithPortrait,
  captureSourceImage,
  loadImage,
  preloadFonts,
  CARD_WIDTH,
  CARD_HEIGHT,
} from "./lib/canvas/draw-card";
import {
  DEV_UNLOCK_COOKIE,
  getEventUnlockTime,
  hasCookieClient,
  setDevUnlockCookieClient,
  clearDevUnlockCookieClient,
} from "./lib/event-gate";
import { EVENT_COPY } from "./lib/event-copy";

const COOLDOWN_MS = 60_000;

type StatusMessage = {
  tone: "info" | "error" | "success";
  text: string;
};

function isLikelyMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return {
    days,
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
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
    text: EVENT_COPY.statusDefault,
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
        text: EVENT_COPY.cameraReady,
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
        setDevUnlockCookieClient();
        setDevUnlocked(true);
        return;
      }

      if (params.get("dev_lock") === "1") {
        clearDevUnlockCookieClient();
        setDevUnlocked(false);
        return;
      }

      setDevUnlocked(hasCookieClient(DEV_UNLOCK_COOKIE));
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

  const drawLocalFallback = async (video: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    await preloadFonts();
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
        text: EVENT_COPY.generating,
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
      await preloadFonts();
      canvas.width = CARD_WIDTH;
      canvas.height = CARD_HEIGHT;
      drawCardWithPortrait(context, portrait);
      setCapturedImage(canvas.toDataURL("image/png"));
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      setNow(Date.now());
      setStatus({
        tone: "success",
        text: EVENT_COPY.generatedSuccess,
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
    link.download = EVENT_COPY.downloadFilename;
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
        text: "Enviando tu retrato neural al muro...",
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
        text: EVENT_COPY.shareSuccess,
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
      <main className="flex min-h-dvh flex-col bg-bg text-white">
        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-5 py-10 text-center">
          <div className="flex flex-col items-center gap-5">
            {/* Neura.Lab logo */}
            <Image
              src="/neura-logo.png"
              alt="Neura.Lab"
              width={64}
              height={64}
              className="h-16 w-16 object-contain"
            />
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-glow/50 bg-brand-glow/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-brand-glow">
              {EVENT_COPY.gateBadge}
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-black leading-[0.92] tracking-[-0.06em] text-brand-glow sm:text-7xl">
              {EVENT_COPY.gateTitle}
            </h1>
            <p className="mx-auto max-w-xl text-base leading-7 text-muted sm:text-lg">
              {EVENT_COPY.gateSubtitle}
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
                <div className="text-3xl font-black text-brand-glow sm:text-5xl">{value}</div>
                <div className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-faint">{label}</div>
              </div>
            ))}
          </div>
        </section>
        <footer className="border-t border-brand/10 px-5 py-4 text-center font-mono text-xs text-muted">
          <a
            href="https://neuralab.lat"
            target="_blank"
            rel="noreferrer"
            className="font-black text-brand-glow transition hover:text-brand"
          >
            Neura.Lab
          </a>
        </footer>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-bg text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-6 sm:px-8 lg:grid lg:grid-cols-[0.95fr_1.05fr] lg:items-start lg:py-10">
        <div className="flex flex-col gap-6">
          {/* Branding lockup: logo centrado con wordmark */}
          <div className="flex items-center gap-4 lg:gap-5">
            <Image
              src="/neura-logo.png"
              alt="Neura.Lab"
              width={120}
              height={120}
              priority
              className="w-14 h-14 sm:w-16 sm:h-16 lg:w-[120px] lg:h-[120px] object-contain shrink-0"
            />
            <div className="flex flex-col gap-1">
              <p className="text-2xl font-black text-white tracking-[-0.03em] sm:text-3xl lg:text-4xl">
                Neura.Lab
              </p>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.26em] text-brand-glow sm:text-xs lg:text-xs">
                Growth Partners
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="max-w-xl text-5xl font-black leading-[0.92] tracking-[-0.06em] text-brand-glow sm:text-7xl">
              {EVENT_COPY.heroTitle}
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted sm:text-lg">
              {EVENT_COPY.heroSubtitle}
            </p>
          </div>

          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              status.tone === "error"
                ? "border-red-400/40 bg-red-500/10 text-red-100"
                : status.tone === "success"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                  : "border-brand-glow/30 bg-brand-glow/10 text-muted"
            }`}
          >
            {status.text}
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={startCamera}
                className="rounded-xl bg-brand-glow px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-bg transition hover:scale-[1.01] hover:bg-brand"
              >
                {cameraReady ? "Reactivar cámara" : "Activar cámara"}
              </button>
              <button
                type="button"
                onClick={captureCard}
                disabled={!cameraReady || !canGenerate}
                className="rounded-xl border-2 border-brand-glow px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-brand-glow transition hover:scale-[1.01] hover:bg-brand-glow hover:text-bg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent disabled:hover:text-brand-glow"
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
                className="rounded-lg border border-brand-glow px-3 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-brand-glow transition hover:bg-brand-glow hover:text-bg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brand-glow"
              >
                Descargar
              </button>
              <button
                type="button"
                onClick={openShareDialog}
                disabled={!capturedImage || isSharing}
                className="rounded-lg border border-white/20 px-3 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:border-white/50 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {isSharing ? "Enviando..." : EVENT_COPY.shareDialogTitle}
              </button>
            </div>
            {cooldownRemainingSeconds > 0 && (
              <p className="text-xs font-medium text-muted">
                Límite activo: podrás generar otra imagen en {cooldownRemainingSeconds}s.
              </p>
            )}
          </div>

          {/* ── Síguenos ── */}
          <div className="border-t border-brand/10 pt-5">
            <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-faint">
              Síguenos en nuestras cuentas
            </p>
            <div className="flex flex-col gap-5">

              {/* Neura.Lab */}
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-brand-glow">Neura.Lab</p>
                <div className="flex flex-wrap gap-2">
                  <a href="https://www.neuralab.lat" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-muted transition hover:border-brand-glow/40 hover:bg-brand-glow/5 hover:text-brand-glow">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
                      <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    <span>neuralab.lat</span>
                  </a>
                  <a href="https://www.instagram.com/neura.lab_ai/" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-muted transition hover:border-brand-glow/40 hover:bg-brand-glow/5 hover:text-brand-glow">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
                    </svg>
                    <span>@neura.lab_ai</span>
                  </a>
                  <a href="https://www.linkedin.com/company/neuralab-ai/" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-muted transition hover:border-brand-glow/40 hover:bg-brand-glow/5 hover:text-brand-glow">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <span>Neura.Lab</span>
                  </a>
                </div>
              </div>

              {/* Luis Uribe */}
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Luis Uribe</p>
                <div className="flex flex-wrap gap-2">
                  <a href="https://www.linkedin.com/in/luis-uribehe/?skipRedirect=true" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-muted transition hover:border-brand-glow/40 hover:bg-brand-glow/5 hover:text-brand-glow">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <span>luis-uribehe</span>
                  </a>
                  <a href="https://www.instagram.com/luisconia/" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-muted transition hover:border-brand-glow/40 hover:bg-brand-glow/5 hover:text-brand-glow">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
                    </svg>
                    <span>@luisconia</span>
                  </a>
                </div>
              </div>

              {/* Alejandro Huerta */}
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Alejandro Huerta</p>
                <div className="flex flex-wrap gap-2">
                  <a href="https://www.linkedin.com/in/alejandro-huerta-herrera-9b8860181/" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-muted transition hover:border-brand-glow/40 hover:bg-brand-glow/5 hover:text-brand-glow">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <span>alejandro-huerta</span>
                  </a>
                </div>
              </div>

            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[430px] lg:max-w-[460px]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-3 shadow-2xl">
            <div className="relative aspect-[2/3] overflow-hidden rounded-[1.55rem] border-[10px] border-brand-glow bg-black font-mono">
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
                  alt="Tu retrato neural Neura.Lab"
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pb-5 pt-20 text-center">
                  <span className="mb-2 inline-flex bg-brand-glow px-3 py-1 text-xs font-black tracking-[0.18em] text-bg">
                    {EVENT_COPY.eventDateBadge}
                  </span>
                  <p className="text-xl font-black tracking-[0.02em] text-brand-glow">
                    {EVENT_COPY.eventShortName}
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
                            ? "bg-brand-glow"
                            : (loaderStep + index) % 2 === 0
                              ? "bg-white"
                              : "bg-faint"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-glow">
                    {EVENT_COPY.generatingLabel}
                  </p>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_4px_rgba(0,0,0,0.7)]" />
            </div>
            <div className="mt-3 text-center">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-brand-glow">NEURA.LAB</p>
              <p className="text-[10px] uppercase tracking-[0.20em] text-faint">Growth Partners</p>
            </div>
          </div>
        </div>
      </section>
      <footer className="border-t border-brand/10 px-5 py-4 text-center font-mono text-xs text-muted">
          <a
            href="https://neuralab.lat"
            target="_blank"
            rel="noreferrer"
            className="font-black text-brand-glow transition hover:text-brand"
          >
            Neura.Lab
          </a>
        </footer>
      {isShareDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-wall-title"
            className="w-full max-w-md rounded-[2rem] border border-brand-glow/50 bg-surface p-6 text-white shadow-2xl"
          >
            <div className="space-y-4">
              <div className="inline-flex rounded-full bg-brand-glow px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-bg">
                Confirmación
              </div>
              <h2 id="share-wall-title" className="text-2xl font-black leading-tight text-brand-glow">
                Enviar al muro
              </h2>
              <p className="text-sm leading-6 text-foreground">
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
                className="rounded-xl bg-brand-glow px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-bg transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSharing ? EVENT_COPY.shareSending : EVENT_COPY.shareConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}
