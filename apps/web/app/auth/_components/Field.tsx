export function Field({
  label,
  id,
  type,
  value,
  onChange,
  placeholder,
  rightLabel,
}: {
  label: string
  id: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  rightLabel?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-space-1">
      <div className="flex justify-between items-center px-1">
        <label htmlFor={id} className="text-label text-text-secondary">
          {label}
        </label>
        {rightLabel}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        required
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-[38px] bg-surface-raised border border-border rounded-sm px-space-3 text-body text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-accent transition-colors"
      />
    </div>
  )
}
