import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  DEFAULT_REGION,
  fetchTrendingVideos,
  isYoutubeExploreConfigured,
  YOUTUBE_REGIONS,
  YoutubeApiError,
} from "@/lib/youtube"
import { RegionPicker } from "./RegionPicker"

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: { region?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const region = YOUTUBE_REGIONS.some((r) => r.code === searchParams.region)
    ? searchParams.region!
    : DEFAULT_REGION

  if (!isYoutubeExploreConfigured()) {
    return (
      <div>
        <h1 className="text-headline-lg font-semibold text-primary mb-space-6">Explore</h1>
        <div className="p-space-6 bg-surface border border-border rounded-md">
          <p className="text-body text-on-surface mb-space-2">This feature isn&apos;t set up yet.</p>
          <p className="text-body-sm text-text-secondary">
            Browsing trending videos by region needs a YouTube Data API v3 key. Set{" "}
            <code className="text-accent">YOUTUBE_API_KEY</code> in the server environment (see{" "}
            <code className="text-accent">apps/web/.env.local.example</code>) to enable it.
          </p>
        </div>
      </div>
    )
  }

  let videos: Awaited<ReturnType<typeof fetchTrendingVideos>> = []
  let error: string | null = null
  try {
    videos = await fetchTrendingVideos(region)
  } catch (err) {
    error = err instanceof YoutubeApiError ? err.message : "Failed to load trending videos."
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-space-6">
        <h1 className="text-headline-lg font-semibold text-primary">Explore</h1>
        <RegionPicker value={region} />
      </div>

      {error ? (
        <div className="p-space-6 bg-surface border border-border rounded-md">
          <p className="text-body text-error">{error}</p>
        </div>
      ) : videos.length === 0 ? (
        <p className="text-body text-text-secondary">No trending videos found for this region.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-4">
          {videos.map((video) => (
            <a
              key={video.id}
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="flex gap-space-3 p-space-3 bg-surface border border-border rounded-md hover:border-accent transition-colors"
            >
              {video.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable YouTube CDN domains
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  width={120}
                  height={68}
                  className="rounded-sm shrink-0 w-[120px] h-[68px] object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="text-body-sm font-semibold text-on-surface line-clamp-2">{video.title}</p>
                <p className="text-body-sm text-text-secondary truncate">{video.channelTitle}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
