import type { ThemeName } from "@inkvault/core";

export function OwlMascot({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="owl mascot" role="img">
      <path d="M18 24 L14 8 L28 18 Z" fill="#7a5c33" />
      <path d="M46 24 L50 8 L36 18 Z" fill="#7a5c33" />
      <ellipse cx="32" cy="38" rx="19" ry="21" fill="#8b6f47" />
      <ellipse cx="32" cy="44" rx="12" ry="12" fill="#e8d9b8" />
      <circle cx="24" cy="30" r="7.5" fill="#fdf6e3" />
      <circle cx="40" cy="30" r="7.5" fill="#fdf6e3" />
      <circle cx="24" cy="30" r="3.2" fill="#2b2118" />
      <circle cx="40" cy="30" r="3.2" fill="#2b2118" />
      <path d="M32 34 L27.5 40 L36.5 40 Z" fill="#e0a458" />
      <path d="M26 58 h4 M34 58 h4" stroke="#e0a458" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CatMascot({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="cat mascot" role="img">
      <path d="M16 26 L11 6 L27 17 Z" fill="#241040" stroke="#ff2e88" strokeWidth="2" strokeLinejoin="round" />
      <path d="M48 26 L53 6 L37 17 Z" fill="#241040" stroke="#ff2e88" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="32" cy="36" r="20" fill="#241040" stroke="#00f0ff" strokeWidth="2" />
      <rect x="18" y="30" width="12" height="8" rx="2" fill="#00f0ff" />
      <rect x="34" y="30" width="12" height="8" rx="2" fill="#00f0ff" />
      <rect x="30" y="32" width="4" height="3" fill="#ff2e88" />
      <path d="M18 30 L14 27 M46 30 L50 27" stroke="#ff2e88" strokeWidth="1.5" />
      <path d="M29 44 Q32 47 35 44" stroke="#ff2e88" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M20 40 L12 42 M20 43 L13 46 M44 40 L52 42 M44 43 L51 46" stroke="#00f0ff" strokeWidth="1.2" />
    </svg>
  );
}

export function Mascot({ theme, size = 28 }: { theme: ThemeName; size?: number }) {
  if (theme === "synthwave") return <CatMascot size={size} />;
  if (theme === "lofi") return <OwlMascot size={size} />;
  return <OwlMascot size={size} />;
}
