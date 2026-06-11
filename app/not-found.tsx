import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark size={64} />
      <h1 className="mt-2 text-3xl font-bold text-white">Spot not found</h1>
      <p className="text-slate-400">
        We don&apos;t have boating conditions for that spot yet.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center rounded-full bg-slate-900/60 px-4 text-sm text-ocean-300 ring-1 ring-white/10 backdrop-blur transition-colors hover:ring-ocean-500/50"
      >
        ← Back to all boating towns
      </Link>
    </main>
  );
}
