import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

// Ensure React Testing Library unmounts components between tests so jsdom
// state (and chrome mock listeners) don't leak across test cases.
afterEach(() => {
  cleanup()
})
