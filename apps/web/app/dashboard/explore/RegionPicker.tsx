"use client"

import { useRouter } from "next/navigation"
import { YOUTUBE_REGIONS } from "@/lib/youtube"

export function RegionPicker({ value }: { value: string }) {
  const router = useRouter()

  return (
    <select
      value={value}
      onChange={(e) => router.push(`/dashboard/explore?region=${e.target.value}`)}
      className="bg-surface-raised border border-border rounded-sm px-space-3 py-space-2 text-body text-on-surface focus:outline-none focus:border-accent"
      aria-label="Region"
    >
      {YOUTUBE_REGIONS.map((region) => (
        <option key={region.code} value={region.code}>
          {region.flag} {region.label}
        </option>
      ))}
    </select>
  )
}
