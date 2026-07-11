export default function HeaderSkeleton() {
  return (
    <div
      className="fixed inset-x-0 top-0 z-[800] border-b border-slate-200/80 bg-white/95 backdrop-blur-sm"
      style={{ height: "var(--app-header-height, 136px)" }}
      aria-hidden
    />
  );
}
