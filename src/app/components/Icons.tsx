/**
 * Icons.tsx — モダンなストロークスタイル SVG アイコン集(絵文字の代替)
 * すべて 24x24 viewBox・currentColor・stroke ベース(lucide 風)
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
      style={{ flex: 'none', display: 'block' }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconLogo = (p: P) => (
  <Svg {...p} strokeWidth={1.8}>
    {/* 猫顔 */}
    <path d="M4.5 10.5 3.5 4.8a.6.6 0 0 1 .9-.66l4.3 2.6a10.8 10.8 0 0 1 6.6 0l4.3-2.6a.6.6 0 0 1 .9.66l-1 5.7" />
    <path d="M20.5 13.5c0 4.4-3.8 7.5-8.5 7.5S3.5 17.9 3.5 13.5 7.3 6 12 6s8.5 3.1 8.5 7.5Z" />
    <circle cx="9" cy="13" r=".9" fill="currentColor" stroke="none" />
    <circle cx="15" cy="13" r=".9" fill="currentColor" stroke="none" />
    <path d="M12 15.6c-.5.7-1.2 1-2 1M12 15.6c.5.7 1.2 1 2 1M12 14.8v.8" />
  </Svg>
);

export const IconFolderOpen = (p: P) => (
  <Svg {...p}>
    <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </Svg>
);

export const IconWand = (p: P) => (
  <Svg {...p}>
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    <path d="M19 3v3M5 18v3M17.5 4.5 20 7M4 17l2.5 2.5" strokeWidth={1.4} />
  </Svg>
);

export const IconFilePlus = (p: P) => (
  <Svg {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M9 15h6M12 18v-6" />
  </Svg>
);

export const IconGift = (p: P) => (
  <Svg {...p}>
    <path d="M20 12v10H4V12" />
    <path d="M2 7h20v5H2z" />
    <path d="M12 22V7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </Svg>
);

export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Svg>
);

export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
  </Svg>
);

export const IconCode = (p: P) => (
  <Svg {...p}>
    <path d="m16 18 6-6-6-6" />
    <path d="m8 6-6 6 6 6" />
  </Svg>
);

export const IconPuzzle = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 3.5a2 2 0 1 1-3.9 0A2 2 0 0 1 12 2a2 2 0 0 1 2.5 1.5Z" strokeWidth={1.6} />
    <path d="M5 6h4.6M14.4 6H19a1 1 0 0 1 1 1v4.5M4 7v12a1 1 0 0 0 1 1h4.5M20 14v5a1 1 0 0 1-1 1h-4.6M10.5 20H7" />
    <path d="M21 11.5a2 2 0 1 0-2.5 1.9M7 3.9A2 2 0 1 0 5.9 7M16.9 20.1a2 2 0 1 0 1.2-3" strokeWidth={1.6} />
  </Svg>
);

export const IconActivity = (p: P) => (
  <Svg {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </Svg>
);

export const IconBranch = (p: P) => (
  <Svg {...p}>
    <path d="M6 3v12" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </Svg>
);

export const IconBraces = (p: P) => (
  <Svg {...p}>
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" />
    <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
  </Svg>
);

export const IconList = (p: P) => (
  <Svg {...p}>
    <path d="M3 5h.01M3 12h.01M3 19h.01" strokeWidth={2.6} />
    <path d="M8 5h13M8 12h13M8 19h13" />
  </Svg>
);

export const IconCheckCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 5-6" />
  </Svg>
);

export const IconAlertTriangle = (p: P) => (
  <Svg {...p}>
    <path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);

export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </Svg>
);

export const IconXCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15 9-6 6M9 9l6 6" />
  </Svg>
);

export const IconInbox = (p: P) => (
  <Svg {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Svg>
);

export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </Svg>
);

export const IconZoomIn = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
  </Svg>
);

export const IconZoomOut = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3M8 11h6" />
  </Svg>
);

export const IconZoomFit = (p: P) => (
  <Svg {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
);

export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconFile = (p: P) => (
  <Svg {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </Svg>
);

export const IconLightbulb = (p: P) => (
  <Svg {...p}>
    <path d="M9 18h6M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" />
  </Svg>
);

export const IconPencil = (p: P) => (
  <Svg {...p}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </Svg>
);

export const IconBook = (p: P) => (
  <Svg {...p}><path d="M4 4.5C7 3.5 9.5 3.7 12 5.5c2.5-1.8 5-2 8-1v14c-3-1-5.5-.8-8 1-2.5-1.8-5-2-8-1z" /><path d="M12 5.5v14" /></Svg>
);
export const IconArrowLeft = (p: P) => <Svg {...p}><path d="m12 19-7-7 7-7M5 12h14" /></Svg>;
export const IconArrowRight = (p: P) => <Svg {...p}><path d="m12 5 7 7-7 7M19 12H5" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Svg>;
