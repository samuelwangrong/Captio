import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DeleteAccountSection } from "./DeleteAccountSection"

describe("DeleteAccountSection", () => {
  it("starts collapsed, showing only a 'Delete account' button", () => {
    render(<DeleteAccountSection email="sam@example.com" deleteAccount={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("sam@example.com")).not.toBeInTheDocument()
  })

  it("expands to a confirmation input with the delete button disabled until the email matches exactly", async () => {
    const user = userEvent.setup()
    render(<DeleteAccountSection email="sam@example.com" deleteAccount={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Delete account" }))

    const confirmButton = screen.getByRole("button", { name: /permanently delete my account/i })
    expect(confirmButton).toBeDisabled()

    const input = screen.getByPlaceholderText("sam@example.com")
    await user.type(input, "wrong@example.com")
    expect(confirmButton).toBeDisabled()

    await user.clear(input)
    await user.type(input, "sam@example.com")
    expect(confirmButton).toBeEnabled()
  })

  it("Cancel collapses back to the initial state and clears the confirmation text", async () => {
    const user = userEvent.setup()
    render(<DeleteAccountSection email="sam@example.com" deleteAccount={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Delete account" }))
    await user.type(screen.getByPlaceholderText("sam@example.com"), "sam@example.com")
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("sam@example.com")).not.toBeInTheDocument()
  })

  it("clicking the confirmed delete button calls deleteAccount and shows a pending state", async () => {
    const user = userEvent.setup()
    let resolveDelete: () => void
    const deleteAccount = vi.fn(() => new Promise<void>((resolve) => { resolveDelete = resolve }))

    render(<DeleteAccountSection email="sam@example.com" deleteAccount={deleteAccount} />)

    await user.click(screen.getByRole("button", { name: "Delete account" }))
    await user.type(screen.getByPlaceholderText("sam@example.com"), "sam@example.com")
    await user.click(screen.getByRole("button", { name: /permanently delete my account/i }))

    expect(deleteAccount).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled()

    resolveDelete!()
  })
})
