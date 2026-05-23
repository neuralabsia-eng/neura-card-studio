import Image from "next/image";
import {
  getSupabaseBrowserConfig,
  listWallImages,
  shuffleWallImages,
  SupabaseWallConfigError,
  type SupabaseBrowserConfig,
  type WallImageRecord,
} from "../lib/wall";
import WallRealtime from "./wall-realtime";

export const dynamic = "force-dynamic";

type WallPageState =
  | {
      configured: true;
      images: WallImageRecord[];
      supabaseConfig: SupabaseBrowserConfig | null;
    }
  | {
      configured: false;
      images: [];
      supabaseConfig: null;
    };

async function getWallPageState(): Promise<WallPageState> {
  try {
    return {
      configured: true,
      images: shuffleWallImages(await listWallImages()),
      supabaseConfig: getSupabaseBrowserConfig(),
    };
  } catch (error) {
    if (error instanceof SupabaseWallConfigError) {
      return {
        configured: false,
        images: [],
        supabaseConfig: null,
      };
    }

    throw error;
  }
}

export default async function MuroPage() {
  const state = await getWallPageState();

  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg text-foreground">
      {/* Neura ambient: radial glow + pulsing orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(168,85,247,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.04)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand/20 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-brand-deep/15 blur-3xl animate-pulse [animation-delay:1.5s]" />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-6 bg-gradient-to-b from-bg/92 via-bg/55 to-transparent p-5 pb-20 sm:p-8 sm:pb-24">
        <h1 className="max-w-[calc(100%-8rem)] font-mono text-4xl font-black uppercase leading-[0.98] tracking-[0.08em] text-gradient-brand [font-variant-ligatures:none] [text-shadow:0_0_32px_rgba(124,58,237,0.6)] sm:max-w-[calc(100%-11rem)] sm:text-6xl lg:text-7xl">
          MURO DE AGENTES · NEURA.LAB
        </h1>
        <div className="shrink-0 bg-surface border border-brand/20 p-2 shadow-[0_18px_55px_rgba(124,58,237,0.3)] sm:p-3">
          <Image
            src="/qr.png"
            alt="QR para generar tu retrato neural"
            width={144}
            height={144}
            priority
            className="h-24 w-24 object-contain sm:h-36 sm:w-36"
          />
        </div>
      </header>

      <WallRealtime
        configured={state.configured}
        initialImages={state.images}
        supabaseConfig={state.supabaseConfig}
      />

      <footer className="pointer-events-auto absolute inset-x-0 bottom-0 z-50 border-t border-brand/10 bg-bg/75 px-5 py-4 text-center font-mono text-xs leading-6 text-muted backdrop-blur-sm sm:text-sm">
        Original por{" "}
        <a
          href="https://erasmoh.dev"
          target="_blank"
          rel="noreferrer"
          className="font-black text-brand-glow underline decoration-brand/40 underline-offset-4 transition hover:text-brand"
        >
          @ErasmoHernandez
        </a>
        {" "}· Rebrand por{" "}
        <a
          href="https://neuralab.lat"
          target="_blank"
          rel="noreferrer"
          className="font-black text-foreground underline decoration-white/30 underline-offset-4 transition hover:text-brand-glow"
        >
          Neura.Lab
        </a>
      </footer>
    </main>
  );
}
