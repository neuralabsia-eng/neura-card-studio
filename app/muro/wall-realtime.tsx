"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseBrowserConfig, WallImageRecord } from "../lib/wall";

type WallRealtimeProps = {
  configured: boolean;
  initialImages: WallImageRecord[];
  supabaseConfig: SupabaseBrowserConfig | null;
};

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getCardStyle(image: WallImageRecord, index: number, total: number): CSSProperties {
  const hash = hashString(`${image.id}-${image.updated_at}`);
  const columns = Math.max(1, Math.ceil(Math.sqrt(total * 1.35)));
  const rows = Math.max(1, Math.ceil(total / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const cellWidth = 76 / columns;
  const cellHeight = 56 / rows;
  const jitterX = (((hash >> 3) % 100) / 100 - 0.5) * cellWidth * 0.55;
  const jitterY = (((hash >> 11) % 100) / 100 - 0.5) * cellHeight * 0.55;
  const rotation = (hash % 35) - 17;
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

function WallImageCounter({ count }: { count: number }) {
  return (
    <div className="pointer-events-none absolute left-5 top-36 z-50 bg-black/70 px-4 py-3 font-mono text-[#f7df1e] shadow-[6px_6px_0_#000] backdrop-blur-sm sm:left-8 sm:top-48 sm:px-5 sm:py-4">
      <div className="text-4xl font-black leading-none tracking-[0.08em] sm:text-6xl">
        {String(count).padStart(3, "0")}
      </div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-100 sm:text-xs">
        imágenes en el muro
      </div>
    </div>
  );
}

export default function WallRealtime({ configured, initialImages, supabaseConfig }: WallRealtimeProps) {
  const [images, setImages] = useState(() => initialImages);

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

  if (!configured || !supabaseConfig) {
    return (
      <div className="relative z-10 flex min-h-dvh items-center justify-center p-6 text-center text-yellow-100">
        Falta configurar Supabase para cargar el muro en tiempo real.
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <>
        <WallImageCounter count={images.length} />
        <div className="relative z-10 flex min-h-dvh items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-3">
            <p className="text-3xl font-black text-[#f7df1e]">Aún no hay cards en el muro</p>
            <p className="text-sm leading-6 text-zinc-400">
              Cuando alguien autorice compartir su imagen generada, aparecerá aquí.
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
            style={getCardStyle(image, index, images.length)}
            className="absolute w-[38vw] min-w-[132px] max-w-[240px] overflow-hidden rounded-[1.15rem] bg-black shadow-[0_24px_70px_rgba(0,0,0,0.6)] transition duration-300 hover:z-50 hover:scale-110 sm:w-[24vw] md:w-[220px]"
          >
            <div className="relative aspect-[2/3]">
              <Image
                src={image.image_url}
                alt="Card compartida en el muro del evento"
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
