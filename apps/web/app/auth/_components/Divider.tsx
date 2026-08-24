export function Divider() {
  return (
    <div className="flex items-center gap-space-4 my-space-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-label text-text-secondary uppercase tracking-widest">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}
