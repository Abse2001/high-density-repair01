import { expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
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

const TARGET_TRACE_NAME = "source_trace_50"

const isTargetTrace = (item: {
  connectionName: string
  rootConnectionName?: string
}) =>
  item.connectionName === TARGET_TRACE_NAME ||
  item.rootConnectionName === TARGET_TRACE_NAME

const createTraceVisualization = (params: {
  routes: HighDensityRoute[]
  colorMap?: Record<string, string>
}): GraphicsObject => {
  const { routes, colorMap } = params
  const lines: NonNullable<GraphicsObject["lines"]> = []
  const circles: NonNullable<GraphicsObject["circles"]> = []
  const traceColor =
    colorMap?.[TARGET_TRACE_NAME] ?? "hsl(258.28877005347596, 100%, 50%)"

  for (const route of routes) {
    for (let i = 0; i < route.route.length - 1; i++) {
      const start = route.route[i]
      const end = route.route[i + 1]

      if (start.z !== end.z) continue

      lines.push({
        points: [
          { x: start.x, y: start.y },
          { x: end.x, y: end.y },
        ],
        strokeColor: start.z === 0 ? traceColor : "rgba(76, 0, 255, 0.5)",
        strokeWidth: route.traceThickness,
        strokeDash: start.z === 0 ? undefined : [0.1, 0.3],
        layer: `trace-z${start.z}`,
      })
    }

    for (const via of route.vias) {
      circles.push({
        center: via,
        radius: route.viaDiameter / 2,
        stroke: traceColor,
        fill: "rgba(37, 99, 235, 0.12)",
        layer: "trace-vias",
      })
    }
  }

  return {
    coordinateSystem: "cartesian",
    title: "HighDensityForceImproveSolver trace view",
    lines,
    circles,
  }
}

const fixturePath = fileURLToPath(
  new URL(
    "./fixtures/highDensityForceImproveSolver-input.json",
    import.meta.url,
  ),
)

test("HighDensityForceImproveSolver final view matches the regression snapshot", async () => {
  const fixtureEntries = (await Bun.file(
    fixturePath,
  ).json()) as SolverFixtureEntry[]

  const fixture = fixtureEntries[0]

  const solver = new HighDensityForceImproveSolver({
    nodeWithPortPoints: fixture.nodeWithPortPoints,
    hdRoutes: fixture.hdRoutes,
    colorMap: fixture.colorMap,
    totalStepsPerNode: fixture.totalStepsPerNode,
    nodeAssignmentMargin: fixture.nodeAssignmentMargin,
  })

  solver.solve()

  const graphics = createTraceVisualization({
    routes: solver.getOutput().filter(isTargetTrace),
    colorMap: fixture.colorMap,
  })

  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
