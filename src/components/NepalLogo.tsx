import { cn } from "@/lib/utils";

/**
 * Nepal flag as a compact SVG logo. Two stacked crimson pennants with
 * a royal-blue border, a stylised sun and crescent moon.
 */
export function NepalLogo({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 100 120"
      width={size}
      height={size * 1.2}
      className={cn("drop-shadow-[0_4px_12px_rgba(220,20,60,0.45)]", className)}
      aria-label="Nepal flag"
    >
      <defs>
        <linearGradient id="crimson" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#e11d48" />
          <stop offset="1" stopColor="#b91c3c" />
        </linearGradient>
      </defs>
      <path
        d="M6 4 L6 116 L86 60 L48 60 L92 16 L48 16 Z"
        fill="url(#crimson)"
        stroke="#1e3a8a"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      {/* Moon (upper pennant) */}
      <g transform="translate(28 30)" fill="#fff">
        <circle cx="0" cy="0" r="8" />
        <circle cx="3" cy="-2" r="7" fill="url(#crimson)" />
      </g>
      {/* Sun (lower pennant) */}
      <g transform="translate(24 80)" fill="#fff">
        <circle cx="0" cy="0" r="6" />
        {Array.from({ length: 12 }).map((_, i) => (
          <rect
            key={i}
            x="-1"
            y="-11"
            width="2"
            height="4"
            transform={`rotate(${i * 30})`}
          />
        ))}
      </g>
    </svg>
  );
}