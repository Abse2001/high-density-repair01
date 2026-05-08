import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { HighDensityForceImproveSolver } from "lib/HighDensityForceImproveSolver"
import type {
  HighDensityRoute,
  NodeWithPortPoints,
} from "lib/types/high-density-types"

type SolverFixtureEntry = {
  nodeWithPortPoints: NodeWithPortPoints[]
  hdRoutes: HighDensityRoute[]
  colorMap?: Record<string, string>
  totalStepsPerNode?: number
  nodeAssignmentMargin?: number
}

const fixturePath = fileURLToPath(
  new URL("./fixtures/highDensityForceImproveSolver-input.json", import.meta.url),
)

test("HighDensityForceImproveSolver final view matches the regression snapshot", async () => {
  const fixtureEntries =
    (await Bun.file(fixturePath).json()) as SolverFixtureEntry[]

  expect(Array.isArray(fixtureEntries)).toBe(true)
  expect(fixtureEntries).toHaveLength(1)

  const fixture = fixtureEntries[0]
  expect(fixture).toBeDefined()

  const solver = new HighDensityForceImproveSolver({
    nodeWithPortPoints: fixture.nodeWithPortPoints,
    hdRoutes: fixture.hdRoutes,
    colorMap: fixture.colorMap,
    totalStepsPerNode: fixture.totalStepsPerNode,
    nodeAssignmentMargin: fixture.nodeAssignmentMargin,
  })

  solver.solve()

  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
