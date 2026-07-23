import type { ReactElement } from "react";

/** Clean pixel-friendly calendar mark for season date range. */
export function CalendarIcon({
  className = "",
}: Readonly<{ className?: string }>): ReactElement {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* body */}
      <rect x="1" y="3" width="14" height="12" rx="1.5" fill="#c6c6c6" stroke="#1a1a1a" strokeWidth="1" />
      {/* header bar */}
      <rect x="1" y="3" width="14" height="3.5" fill="#8b5a2b" stroke="#1a1a1a" strokeWidth="1" />
      {/* rings */}
      <rect x="4" y="1" width="1.5" height="4" rx="0.5" fill="#555" stroke="#1a1a1a" strokeWidth="0.6" />
      <rect x="10.5" y="1" width="1.5" height="4" rx="0.5" fill="#555" stroke="#1a1a1a" strokeWidth="0.6" />
      {/* day cells */}
      <rect x="3" y="8" width="2" height="2" fill="#efefef" />
      <rect x="6" y="8" width="2" height="2" fill="#efefef" />
      <rect x="9" y="8" width="2" height="2" fill="#efefef" />
      <rect x="12" y="8" width="1.5" height="2" fill="#efefef" />
      <rect x="3" y="11" width="2" height="2" fill="#d14cff" />
      <rect x="6" y="11" width="2" height="2" fill="#efefef" />
      <rect x="9" y="11" width="2" height="2" fill="#efefef" />
    </svg>
  );
}
