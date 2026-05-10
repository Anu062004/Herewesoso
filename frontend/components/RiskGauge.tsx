interface RiskGaugeProps {
  score: number;
}

function tone(score: number) {
  if (score < 30) return '#00e676';
  if (score < 55) return '#ffd600';
  return '#ff1744';
}

export default function RiskGauge({ score }: RiskGaugeProps) {
  const clamped = Math.max(0, Math.min(score, 100));
  const color = tone(clamped);

  return (
    <div className="rounded-3xl border border-white/8 bg-black/20 p-4">
      <p className="data-label">Risk Gauge</p>
      <div className="relative mt-4 flex justify-center">
        <svg viewBox="0 0 160 100" className="h-32 w-full max-w-[220px]">
          <path
            d="M20 80 A60 60 0 0 1 140 80"
            pathLength={100}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M20 80 A60 60 0 0 1 140 80"
            pathLength={100}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${clamped} 100`}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
          <span className="font-mono text-3xl font-bold text-white">{clamped}</span>
          <span className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            /100
          </span>
        </div>
      </div>
      <p className="mt-2 text-center text-sm text-zinc-400">
        0 is safest. 100 is nearest to liquidation.
      </p>
    </div>
  );
}
