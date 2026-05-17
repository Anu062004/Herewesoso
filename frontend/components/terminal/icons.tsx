import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props
  };
}

export function DashboardIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="9" rx="1.5" />
      <rect x="3" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function AntennaIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 18v3" />
      <path d="M8 21h8" />
      <path d="M12 3a4 4 0 0 1 4 4v6H8V7a4 4 0 0 1 4-4Z" />
      <path d="M5 10a7 7 0 0 1 14 0" />
      <path d="M2 10a10 10 0 0 1 20 0" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 5 6v6c0 4.97 2.91 8.95 7 10 4.09-1.05 7-5.03 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.6 1.6 3.4-4" />
    </svg>
  );
}

export function BriefcaseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 6V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V6" />
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M3 12h18" />
      <path d="M10 12v2" />
      <path d="M14 12v2" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function NotesIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}

export function WorldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

export function CandleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5v14" />
      <path d="M12 3v18" />
      <path d="M19 7v10" />
      <rect x="4" y="8" width="2" height="5" rx="1" />
      <rect x="11" y="6" width="2" height="8" rx="1" />
      <rect x="18" y="10" width="2" height="4" rx="1" />
    </svg>
  );
}

export function RadarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3a9 9 0 1 1-9 9" />
      <path d="M12 7a5 5 0 1 1-5 5" />
      <path d="M12 11a1 1 0 1 1-1 1" />
      <path d="M12 12 5 5" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" />
      <path d="M4 4v5h5" />
      <path d="M20 20v-5h-5" />
    </svg>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-2.8 6.2L7 17l2.8-6.2L16 8Z" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 12 4.2 4.2L19 6.5" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 2.5 19h19L12 3Z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function TelegramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0Zm5.56 8.25-1.97 9.27c-.15.66-.54.82-1.08.51l-3-2.21-1.45 1.39c-.16.16-.3.3-.6.3l.21-3.05 5.56-5.02c.24-.22-.06-.34-.37-.12L7.06 13.67l-2.99-.94c-.65-.2-.66-.65.14-.96l11.68-4.5c.54-.2 1.02.13.84.98Z" />
    </svg>
  );
}

export function AvatarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}
