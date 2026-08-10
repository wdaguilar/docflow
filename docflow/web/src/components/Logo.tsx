/** The isometric cube mark: three faces, three brand colours. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 52 58" aria-hidden="true">
      <path d="M26 2 50 15v28L26 56 2 43V15Z" fill="none" stroke="#1f2a3a" strokeWidth="1" />
      <path d="M26 2 50 15 26 29 2 15Z" fill="#22c55e" />
      <path d="M2 15 26 29v27L2 43Z" fill="#ef4444" />
      <path d="M50 15 26 29v27l24-13Z" fill="#2f7bf6" />
    </svg>
  );
}
