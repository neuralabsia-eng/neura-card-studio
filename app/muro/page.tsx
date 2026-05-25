import Image from "next/image";
import { EVENT_COPY } from "../lib/event-copy";
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

export default async function MuroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [state, params] = await Promise.all([
    getWallPageState(),
    searchParams,
  ]);
  const isPresenter = params.presenter === "1";
  const isLive = params.live === "1" || isPresenter;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg text-foreground">
      {/* Neura ambient: radial glow + pulsing orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(168,85,247,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.04)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand/20 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-brand-deep/15 blur-3xl animate-pulse [animation-delay:1.5s]" />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-6 bg-gradient-to-b from-bg/92 via-bg/55 to-transparent p-5 pb-20 sm:p-8 sm:pb-24">
        <div className="flex flex-col gap-3">
          {/* Neura.Lab lockup — compact */}
          <div className="flex items-center gap-2">
            <Image
              src="/neura-logo.png"
              alt="Neura.Lab"
              width={32}
              height={32}
              className="h-7 w-7 shrink-0 object-contain sm:h-8 sm:w-8"
            />
            <div className="flex flex-col">
              <p className="text-sm font-black leading-tight tracking-[-0.02em] text-white sm:text-base">Neura.Lab</p>
              <p className="font-mono text-[8px] font-bold uppercase tracking-[0.22em] text-brand-glow sm:text-[9px]">Growth Partners</p>
            </div>
          </div>
          <h1 className="whitespace-nowrap font-mono text-xl font-black uppercase leading-none tracking-[0.08em] text-gradient-brand [font-variant-ligatures:none] [text-shadow:0_0_24px_rgba(124,58,237,0.5)] sm:text-2xl">
            {EVENT_COPY.wallTitle}
          </h1>
        </div>
        {!isPresenter && (
          <div className="shrink-0 bg-surface border border-brand/20 p-2 shadow-[0_18px_55px_rgba(124,58,237,0.3)] sm:p-3">
            <Image
              src="/qr.png"
              alt={EVENT_COPY.qrAlt}
              width={144}
              height={144}
              priority
              className="h-24 w-24 object-contain sm:h-36 sm:w-36"
            />
          </div>
        )}
      </header>

      <WallRealtime
        configured={state.configured}
        initialImages={state.images}
        supabaseConfig={state.supabaseConfig}
        isPresenter={isPresenter}
        isLive={isLive}
      />

      <footer className="pointer-events-auto absolute inset-x-0 bottom-0 z-50 border-t border-brand/10 bg-bg/75 px-5 py-3 text-center font-mono text-xs text-muted backdrop-blur-sm">
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
