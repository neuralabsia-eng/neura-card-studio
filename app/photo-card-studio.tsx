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
    drawCard(context, video, EVENT_COPY.canvasEventLabel);
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
      drawCardWithPortrait(context, portrait, EVENT_COPY.canvasEventLabel);
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
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-glow/50 bg-brand-glow/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-brand-glow">
            {EVENT_COPY.gateBadge}
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
        <footer className="border-t border-brand/10 px-5 py-4 text-center font-mono text-xs leading-6 text-muted sm:text-sm">
          {EVENT_COPY.footerOriginal}{" "}
          <a
            href={EVENT_COPY.footerOriginalUrl}
            target="_blank"
            rel="noreferrer"
            className="font-black text-brand-glow underline decoration-brand/40 underline-offset-4 transition hover:text-brand"
          >
            {EVENT_COPY.footerOriginalHandle}
          </a>
          {" · "}{EVENT_COPY.footerRebrand}{" "}
          <a
            href={EVENT_COPY.footerRebrandUrl}
            target="_blank"
            rel="noreferrer"
            className="font-black text-foreground underline decoration-white/30 underline-offset-4 transition hover:text-brand-glow"
          >
            {EVENT_COPY.footerRebrandName}
          </a>
        </footer>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-bg text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-6 sm:px-8 lg:grid lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:py-10">
        <div className="flex flex-col gap-5">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-glow/50 bg-brand-glow/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.24em] text-brand-glow">
            {EVENT_COPY.heroChip}
          </div>
          <div className="space-y-4">
            <h1 className="max-w-xl text-5xl font-black leading-[0.92] tracking-[-0.06em] text-brand-glow sm:text-7xl">
              Tu cara en una card 16-bit JS
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted sm:text-lg">
              Usa la cámara frontal, captura tu foto y genera automáticamente un retrato 16-bit pixel con IA para tu card JavaScript.
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
                            ? "bg-brand-glow"
                            : (loaderStep + index) % 2 === 0
                              ? "bg-white"
                              : "bg-faint"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-glow">
                    Generando retrato 16-bit
                  </p>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_4px_rgba(0,0,0,0.7)]" />
            </div>
            <p className="mt-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-faint">
              {capturedImage ? "Resultado final" : isGenerating ? "Generando" : "Cámara frontal"}
            </p>
          </div>
        </div>
      </section>
      <footer className="border-t border-brand/10 px-5 py-4 text-center font-mono text-xs leading-6 text-muted sm:text-sm">
        {EVENT_COPY.footerOriginal}{" "}
        <a
          href={EVENT_COPY.footerOriginalUrl}
          target="_blank"
          rel="noreferrer"
          className="font-black text-brand-glow underline decoration-brand/40 underline-offset-4 transition hover:text-brand"
        >
          {EVENT_COPY.footerOriginalHandle}
        </a>
        {" · "}{EVENT_COPY.footerRebrand}{" "}
        <a
          href={EVENT_COPY.footerRebrandUrl}
          target="_blank"
          rel="noreferrer"
          className="font-black text-foreground underline decoration-white/30 underline-offset-4 transition hover:text-brand-glow"
        >
          {EVENT_COPY.footerRebrandName}
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
