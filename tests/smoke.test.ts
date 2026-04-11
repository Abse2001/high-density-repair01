import { expect, test } from "bun:test"
import { HighDensityRepair01 } from "lib/HighDensityRepair01"

test("exports the starter solver", () => {
  expect(typeof HighDensityRepair01).toBe("function")
})
