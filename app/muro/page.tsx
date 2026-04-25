import type { CSSProperties } from "react";
import Image from "next/image";
import { listWallImages, shuffleWallImages, SupabaseWallConfigError, type WallImageRecord } from "../lib/wall";

export const dynamic = "force-dynamic";

type WallPageState =
  | {
      configured: true;
      images: WallImageRecord[];
    }
  | {
      configured: false;
      images: [];
    };

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getCardStyle(image: WallImageRecord, index: number): CSSProperties {
  const hash = hashString(`${image.id}-${image.updated_at}`);
  const rotation = (hash % 35) - 17;
  const left = 8 + ((hash + index * 17) % 85);
  const top = 10 + (((hash >> 8) + index * 23) % 80);

  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    zIndex: (index % 9) + 1,
  };
}

async function getWallPageState(): Promise<WallPageState> {
  try {
    return {
      configured: true,
      images: shuffleWallImages(await listWallImages()),
    };
  } catch (error) {
    if (error instanceof SupabaseWallConfigError) {
      return {
        configured: false,
        images: [],
      };
    }

    throw error;
  }
}

export default async function MuroPage() {
  const state = await getWallPageState();

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#0f0f0f] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(247,223,30,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_30%)]" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-6 bg-gradient-to-b from-[#0f0f0f]/92 via-[#0f0f0f]/55 to-transparent p-5 pb-20 sm:p-8 sm:pb-24">
        <h1
          className="max-w-[calc(100%-8rem)] text-4xl font-black uppercase leading-[0.98] tracking-[0.08em] text-[#f7df1e] [font-variant-ligatures:none] [text-shadow:4px_4px_0_#000] sm:max-w-[calc(100%-11rem)] sm:text-6xl lg:text-7xl"
          style={{
            fontFamily:
              "'Courier New', Courier, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          }}
        >
          MURO DEL MEETUP DE JS CHILE
        </h1>
        <div className="shrink-0 bg-white p-2 shadow-[0_18px_55px_rgba(0,0,0,0.55)] sm:p-3">
          <Image
            src="/qr.png"
            alt="QR para generar tu imagen"
            width={144}
            height={144}
            priority
            className="h-24 w-24 object-contain sm:h-36 sm:w-36"
          />
        </div>
      </header>

      {!state.configured ? (
        <div className="relative z-10 flex min-h-dvh items-center justify-center p-6 text-center text-yellow-100">
          Falta configurar Supabase para cargar el muro.
        </div>
      ) : state.images.length === 0 ? (
        <div className="relative z-10 flex min-h-dvh items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-3">
            <p className="text-3xl font-black text-[#f7df1e]">Aún no hay cards en el muro</p>
            <p className="text-sm leading-6 text-zinc-400">
              Cuando alguien autorice compartir su imagen generada, aparecerá aquí.
            </p>
          </div>
        </div>
      ) : (
        <section className="absolute inset-0">
          {state.images.map((image, index) => (
            <article
              key={image.id}
              style={getCardStyle(image, index)}
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
      )}
    </main>
  );
}
