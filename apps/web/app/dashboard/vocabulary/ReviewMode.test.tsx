import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ReviewMode, type VocabCard } from "./ReviewMode"

const cards: VocabCard[] = [
  { id: "1", word: "hola", context: "hola, ¿cómo estás?", video_title: "Spanish 101" },
  { id: "2", word: "mundo", context: "hola mundo", video_title: null },
]

describe("ReviewMode", () => {
  it("renders nothing when there are no cards", () => {
    const { container } = render(<ReviewMode cards={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows the first card's word, hidden context, and a 1-indexed position", () => {
    render(<ReviewMode cards={cards} />)
    expect(screen.getByText("hola")).toBeInTheDocument()
    expect(screen.queryByText("hola, ¿cómo estás?")).not.toBeInTheDocument()
    expect(screen.getByText("Click to reveal context")).toBeInTheDocument()
    expect(screen.getByText("1 / 2")).toBeInTheDocument()
  })

  it("reveals the context on click, and hides it again on the next click", async () => {
    const user = userEvent.setup()
    render(<ReviewMode cards={cards} />)

    await user.click(screen.getByText("hola"))
    expect(screen.getByText("hola, ¿cómo estás?")).toBeInTheDocument()

    await user.click(screen.getByText("hola"))
    expect(screen.queryByText("hola, ¿cómo estás?")).not.toBeInTheDocument()
  })

  it("Next advances to the next card and resets the reveal state", async () => {
    const user = userEvent.setup()
    render(<ReviewMode cards={cards} />)

    await user.click(screen.getByText("hola")) // reveal
    await user.click(screen.getByRole("button", { name: /next/i }))

    expect(screen.getByText("mundo")).toBeInTheDocument()
    expect(screen.getByText("2 / 2")).toBeInTheDocument()
    expect(screen.getByText("Click to reveal context")).toBeInTheDocument()
  })

  it("Next wraps around from the last card back to the first", async () => {
    const user = userEvent.setup()
    render(<ReviewMode cards={cards} />)

    await user.click(screen.getByRole("button", { name: /next/i }))
    await user.click(screen.getByRole("button", { name: /next/i }))

    expect(screen.getByText("hola")).toBeInTheDocument()
    expect(screen.getByText("1 / 2")).toBeInTheDocument()
  })

  it("Previous wraps around from the first card back to the last", async () => {
    const user = userEvent.setup()
    render(<ReviewMode cards={cards} />)

    await user.click(screen.getByRole("button", { name: /previous/i }))

    expect(screen.getByText("mundo")).toBeInTheDocument()
    expect(screen.getByText("2 / 2")).toBeInTheDocument()
  })

  it("shows the video title when present, and omits it when null", async () => {
    const user = userEvent.setup()
    render(<ReviewMode cards={cards} />)
    expect(screen.getByText(/Spanish 101/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /next/i }))
    expect(screen.queryByText(/from "/)).not.toBeInTheDocument()
  })
})
