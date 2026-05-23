"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseBrowserConfig, WallImageRecord } from "../lib/wall";
import { EVENT_COPY } from "../lib/event-copy";

type WallRealtimeProps = {
  configured: boolean;
  initialImages: WallImageRecord[];
  supabaseConfig: SupabaseBrowserConfig | null;
  isPresenter?: boolean;
  isLive?: boolean;
};

type WallApiResponse = {
  images?: unknown;
};

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getCardStyle(image: WallImageRecord, index: number, total: number, isPresenter = false): CSSProperties {
  const hash = hashString(`${image.id}-${image.updated_at}`);
  const columns = Math.max(1, Math.ceil(Math.sqrt(total * 1.35)));
  const rows = Math.max(1, Math.ceil(total / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const cellWidth = 76 / columns;
  const cellHeight = 56 / rows;
  const jitterX = (((hash >> 3) % 100) / 100 - 0.5) * cellWidth * 0.55;
  const jitterY = (((hash >> 11) % 100) / 100 - 0.5) * cellHeight * 0.55;
  const rotRange = isPresenter ? 11 : 35;
  const rotOffset = isPresenter ? 5 : 17;
  const rotation = (hash % rotRange) - rotOffset;
  const left = Math.max(10, Math.min(90, 12 + cellWidth * (column + 0.5) + jitterX));
  const top = Math.max(24, Math.min(82, 26 + cellHeight * (row + 0.5) + jitterY));

  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    zIndex: (hash % 9) + 1,
  };
}

function isWallImageRecord(value: unknown): value is WallImageRecord {
  const record = value as Partial<WallImageRecord>;

  return (
    typeof record.id === "string" &&
    typeof record.image_url === "string" &&
    typeof record.storage_path === "string" &&
    (typeof record.image_hash === "string" || record.image_hash === null) &&
    typeof record.created_at === "string" &&
    typeof record.updated_at === "string"
  );
}

function mergeWallImages(currentImages: WallImageRecord[], incomingImages: WallImageRecord[]) {
  const currentIds = new Set(currentImages.map((image) => image.id));
  const newImages = incomingImages.filter((image) => !currentIds.has(image.id));

  return newImages.length > 0 ? [...newImages, ...currentImages] : currentImages;
}

function WallImageCounter({ count }: { count: number }) {
  return (
    <div className="pointer-events-none absolute left-5 top-36 z-50 bg-surface/80 px-4 py-3 font-mono backdrop-blur-sm sm:left-8 sm:top-48 sm:px-5 sm:py-4 border border-brand/20 rounded-lg"
      style={{ boxShadow: "0 8px 32px rgb(124 58 237 / 0.30), 0 0 64px rgb(124 58 237 / 0.15)" }}
    >
      <div className="text-4xl font-black leading-none tracking-[0.08em] text-gradient-brand sm:text-6xl">
        {String(count).padStart(3, "0")}
      </div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted sm:text-xs">
        {EVENT_COPY.wallCounterLabel}
      </div>
    </div>
  );
}

export default function WallRealtime({ configured, initialImages, supabaseConfig, isPresenter = false, isLive = false }: WallRealtimeProps) {
  const [images, setImages] = useState(() => initialImages);

  useEffect(() => {
    if (!configured) {
      return;
    }

    const refreshImages = async () => {
      try {
        const response = await fetch("/api/wall", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as WallApiResponse;

        if (!Array.isArray(data.images)) {
          return;
        }

        const validImages = data.images.filter(isWallImageRecord);

        setImages((currentImages) => mergeWallImages(currentImages, validImages));
      } catch {
        return;
      }
    };

    const pollMs = (isLive || isPresenter) ? 1500 : 3500;
    const interval = window.setInterval(refreshImages, pollMs);

    return () => window.clearInterval(interval);
  }, [configured, isLive, isPresenter]);

  useEffect(() => {
    if (!configured || !supabaseConfig) {
      return;
    }

    const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey);
    const channel = supabase
      .channel("wall_images_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wall_images",
        },
        (payload) => {
          const newImage = payload.new;

          if (!isWallImageRecord(newImage)) {
            return;
          }

          setImages((currentImages) => {
            if (currentImages.some((image) => image.id === newImage.id)) {
              return currentImages;
            }

            return [newImage, ...currentImages];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [configured, supabaseConfig]);

  if (!configured) {
    return (
      <div className="relative z-10 flex min-h-dvh items-center justify-center p-6 text-center text-muted">
        <div className="space-y-2">
          <p className="text-brand-glow font-mono text-sm uppercase tracking-widest">{EVENT_COPY.wallHudLabel}</p>
          <p>{EVENT_COPY.wallConfigError}</p>
        </div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <>
        <WallImageCounter count={images.length} />
        <div className="relative z-10 flex min-h-dvh items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-3">
            <p className="font-mono text-xs uppercase tracking-widest text-brand-glow">{EVENT_COPY.wallHudLabel}</p>
            <p className="text-3xl font-black text-gradient-brand">{EVENT_COPY.wallEmpty}</p>
            <p className="text-sm leading-6 text-muted">
{EVENT_COPY.wallEmptyHelp}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <WallImageCounter count={images.length} />
      <section className="absolute inset-0">
        {images.map((image, index) => (
          <article
            key={image.id}
            style={getCardStyle(image, index, images.length, isPresenter)}
            className={`absolute w-[38vw] min-w-[132px] max-w-[240px] overflow-hidden rounded-[1.15rem] bg-surface shadow-[0_24px_70px_rgba(124,58,237,0.25)] transition duration-300 sm:w-[24vw] md:w-[220px] ${isPresenter ? "" : "hover:z-50 hover:scale-110"}`}
          >
            <div className="relative aspect-[2/3]">
              <Image
                src={image.image_url}
                alt="Retrato neural compartido en el muro del evento"
                fill
                sizes="(max-width: 640px) 38vw, (max-width: 768px) 24vw, 220px"
                unoptimized
                className="object-cover"
              />
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
