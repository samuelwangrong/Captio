import Link from "next/link"

export function Pagination({
  basePath,
  page,
  hasNext,
}: {
  basePath: string
  page: number
  hasNext: boolean
}) {
  if (page === 1 && !hasNext) return null

  return (
    <div className="flex items-center justify-between mt-space-6">
      {page > 1 ? (
        <Link
          href={`${basePath}?page=${page - 1}`}
          className="text-body-sm text-accent hover:underline"
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-body-sm text-text-secondary">Page {page}</span>
      {hasNext ? (
        <Link href={`${basePath}?page=${page + 1}`} className="text-body-sm text-accent hover:underline">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}
