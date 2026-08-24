"use client"

import { useState } from "react"

export interface VocabCard {
  id: string
  word: string
  context: string | null
  video_title: string | null
}

export function ReviewMode({ cards }: { cards: VocabCard[] }) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  if (cards.length === 0) return null

  const card = cards[index]

  function go(delta: number) {
    setRevealed(false)
    setIndex((i) => (i + delta + cards.length) % cards.length)
  }

  return (
    <div className="mb-space-8">
      <button
        onClick={() => setRevealed((r) => !r)}
        className="w-full min-h-[160px] p-space-6 bg-surface border border-border rounded-lg flex flex-col items-center justify-center text-center gap-space-3 hover:border-accent transition-colors"
      >
        <span className="text-headline-md font-semibold text-primary">{card.word}</span>
        {revealed ? (
          <span className="text-body text-on-surface">{card.context || "No context saved."}</span>
        ) : (
          <span className="text-body-sm text-text-secondary">Click to reveal context</span>
        )}
        {card.video_title && (
          <span className="text-label text-text-secondary">from &ldquo;{card.video_title}&rdquo;</span>
        )}
      </button>

      <div className="flex items-center justify-between mt-space-3">
        <button
          onClick={() => go(-1)}
          className="px-space-3 h-8 bg-surface-raised border border-border rounded-sm text-label text-on-surface hover:border-accent transition-colors"
        >
          Previous
        </button>
        <span className="text-body-sm text-text-secondary">
          {index + 1} / {cards.length}
        </span>
        <button
          onClick={() => go(1)}
          className="px-space-3 h-8 bg-surface-raised border border-border rounded-sm text-label text-on-surface hover:border-accent transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}
