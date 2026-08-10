const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const wrap = (children: React.ReactNode, size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

export const GridIcon = ({ size = 18 }) =>
  wrap(
    <g {...s}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </g>,
    size,
  );

export const FileIcon = ({ size = 18 }) =>
  wrap(
    <g {...s}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </g>,
    size,
  );

export const SendIcon = ({ size = 18 }) =>
  wrap(
    <g {...s}>
      <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4Z" />
    </g>,
    size,
  );

export const ShieldIcon = ({ size = 18 }) =>
  wrap(
    <g {...s}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </g>,
    size,
  );

export const ClockIcon = ({ size = 15 }) =>
  wrap(
    <g {...s}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </g>,
    size,
  );

export const InboxIcon = ({ size = 18 }) =>
  wrap(
    <g {...s}>
      <path d="M3 12h5l1.5 3h5L16 12h5" />
      <path d="M5.5 5h13l2.5 7v6a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 18v-6Z" />
    </g>,
    size,
  );

export const PdfIcon = ({ size = 17, mono = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"
      fill={mono ? "#c7d0dc" : "#e2574c"}
    />
    <path d="M14 2v5h5" fill={mono ? "#9aa7b8" : "#b8382f"} />
    {!mono && (
      <text x="12" y="17" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff">
        PDF
      </text>
    )}
  </svg>
);
