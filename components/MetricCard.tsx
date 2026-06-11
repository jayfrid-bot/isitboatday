export function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-900/60 p-4 ring-1 ring-white/10 backdrop-blur transition-transform duration-200 hover:-translate-y-0.5 hover:ring-white/20">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span aria-hidden>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-white sm:text-2xl">
        {value}
      </div>
      {sub ? <div className="break-words text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}
