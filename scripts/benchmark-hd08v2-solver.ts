import { performance } from "node:perf_hooks"
import { join } from "node:path"
import { parseArgs } from "node:util"
import {
  HighDensityForceImproveSolver,
  type ForceImproveProfile,
  type ForceImproveProfileCounts,
  type ForceImproveProfilePhaseTimes,
} from "../lib/HighDensityForceImproveSolver"
import type {
  HighDensityRepair01Input,
  NodeWithPortPoints,
} from "../lib/types/types"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "assignment-margin": { type: "string" },
    asset: { type: "string" },
    json: { type: "boolean" },
    limit: { type: "string" },
    "no-profile": { type: "boolean" },
    progress: { type: "string" },
    sample: { type: "string" },
    "steps-per-node": { type: "string" },
    "top-k": { type: "string" },
  },
  strict: true,
  allowPositionals: false,
})

const parseIntegerOption = (value: string | undefined, optionName: string) => {
  if (value == null) return undefined

  const parsedValue = Number.parseInt(value, 10)
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`Expected --${optionName} to be a non-negative integer.`)
  }

  return parsedValue
}

const parseNumberOption = (value: string | undefined, optionName: string) => {
  if (value == null) return undefined

  const parsedValue = Number.parseFloat(value)
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`Expected --${optionName} to be a non-negative number.`)
  }

  return parsedValue
}

const sumPhaseTimes = (
  runs: ForceImproveProfile["runs"],
): ForceImproveProfilePhaseTimes => {
  const total: ForceImproveProfilePhaseTimes = {
    buildMutableRoutesMs: 0,
    buildForceElementsMs: 0,
    buildSegmentObstaclesMs: 0,
    initialClampMs: 0,
    viaViaRepulsionMs: 0,
    elementSegmentRepulsionMs: 0,
    borderForceMs: 0,
    nodeMovementMs: 0,
    stepClampMs: 0,
    clearanceProjectionMs: 0,
    finalClearanceProjectionMs: 0,
    materializeRoutesMs: 0,
  }

  for (const run of runs) {
    for (const key of Object.keys(total) as Array<keyof typeof total>) {
      total[key] += run.phaseMs[key]
    }
  }

  return total
}

const sumCounts = (
  runs: ForceImproveProfile["runs"],
): ForceImproveProfileCounts => {
  const total: ForceImproveProfileCounts = {
    viaElementCount: 0,
    pointElementCount: 0,
    viaViaPairChecks: 0,
    viaViaDistanceChecks: 0,
    viaViaInteractions: 0,
    elementSegmentPairChecks: 0,
    elementSegmentDistanceChecks: 0,
    elementSegmentInteractions: 0,
    projectionCalls: 0,
    projectionPasses: 0,
    projectionViaViaPairChecks: 0,
    projectionViaViaDistanceChecks: 0,
    projectionViaViaCorrections: 0,
    projectionElementSegmentPairChecks: 0,
    projectionElementSegmentDistanceChecks: 0,
    projectionElementSegmentCorrections: 0,
  }

  for (const run of runs) {
    for (const key of Object.keys(total) as Array<keyof typeof total>) {
      total[key] += run.counts[key]
    }
  }

  return total
}

const formatMs = (value: number) => `${value.toFixed(2)}ms`

const assetPath =
  values.asset ?? join(import.meta.dir, "..", "assets", "hd08v2.json")
const limit = parseIntegerOption(values.limit, "limit")
const progressInterval = parseIntegerOption(values.progress, "progress") ?? 25
const topK = parseIntegerOption(values["top-k"], "top-k") ?? 10
const totalStepsPerNode = parseIntegerOption(
  values["steps-per-node"],
  "steps-per-node",
)
const nodeAssignmentMargin = parseNumberOption(
  values["assignment-margin"],
  "assignment-margin",
)
const profileEnabled = values["no-profile"] !== true

const samplesByName = (await Bun.file(assetPath).json()) as Record<
  string,
  HighDensityRepair01Input
>
const sortedEntries = Object.entries(samplesByName).sort(([left], [right]) =>
  left.localeCompare(right),
)
const filteredEntries =
  values.sample == null
    ? sortedEntries
    : sortedEntries.filter(([sampleName]) => sampleName === values.sample)
const selectedEntries =
  limit == null ? filteredEntries : filteredEntries.slice(0, limit)

if (selectedEntries.length === 0) {
  throw new Error(`No samples matched in ${assetPath}.`)
}

const inputRouteCount = selectedEntries.reduce(
  (total, [, sample]) => total + sample.nodeHdRoutes.length,
  0,
)
const profile: ForceImproveProfile | undefined = profileEnabled
  ? { runs: [] }
  : undefined

const benchmarkStartedAt = performance.now()
let constructorMs = 0
let solveMs = 0
let iterations = 0
let assignedNodeCount = 0
let improvedRouteCount = 0
let outputRouteCount = 0
let resolvedNodeAssignmentMargin = nodeAssignmentMargin
let resolvedTotalStepsPerNode = totalStepsPerNode

for (const [sampleIndex, [sampleName, sample]] of selectedEntries.entries()) {
  const nodeWithPortPoints: NodeWithPortPoints = {
    ...sample.nodeWithPortPoints,
    capacityMeshNodeId: `${sampleName}:${sample.nodeWithPortPoints.capacityMeshNodeId}`,
  }

  const constructorStartedAt = performance.now()
  const solver = new HighDensityForceImproveSolver({
    nodeWithPortPoints: [nodeWithPortPoints],
    hdRoutes: sample.nodeHdRoutes,
    nodeAssignmentMargin,
    profile,
    totalStepsPerNode,
  })
  constructorMs += performance.now() - constructorStartedAt

  const solveStartedAt = performance.now()
  solver.solve()
  solveMs += performance.now() - solveStartedAt

  if (solver.failed) {
    throw new Error(
      `${sampleName}: ${solver.error ?? "HighDensityForceImproveSolver failed."}`,
    )
  }

  iterations += solver.iterations
  assignedNodeCount += solver.stats.sampleCount
  improvedRouteCount += solver.stats.improvedRouteCount
  outputRouteCount += solver.getOutput().length
  resolvedNodeAssignmentMargin = solver.stats.nodeAssignmentMargin
  resolvedTotalStepsPerNode = solver.stats.totalStepsPerNode

  if (
    progressInterval > 0 &&
    (sampleIndex + 1) % progressInterval === 0 &&
    sampleIndex + 1 < selectedEntries.length
  ) {
    const elapsedMs = performance.now() - benchmarkStartedAt
    console.error(
      `Benchmarked ${sampleIndex + 1}/${selectedEntries.length} samples in ${(
        elapsedMs / 1000
      ).toFixed(2)}s...`,
    )
  }
}

const phaseMs = profile ? sumPhaseTimes(profile.runs) : null
const counts = profile ? sumCounts(profile.runs) : null
const profiledRunMs =
  profile?.runs.reduce((total, run) => total + run.elapsedMs, 0) ?? 0
const totalMs = performance.now() - benchmarkStartedAt
const slowestRuns =
  profile?.runs
    .toSorted(
      (left, right) =>
        right.elapsedMs - left.elapsedMs ||
        (left.label ?? "").localeCompare(right.label ?? ""),
    )
    .slice(0, topK) ?? []
const phaseEntries = phaseMs
  ? (
      Object.entries(phaseMs) as Array<
        [keyof ForceImproveProfilePhaseTimes, number]
      >
    )
      .toSorted(([, left], [, right]) => right - left)
      .filter(([, value]) => value > 0)
  : []

const summary = {
  assetPath,
  assignedNodeCount,
  constructorMs,
  directSolver: true,
  inputRouteCount,
  iterations,
  nodeAssignmentMargin: resolvedNodeAssignmentMargin,
  outputRouteCount,
  profiledRunMs,
  sampleCount: selectedEntries.length,
  sampleFilter: values.sample,
  solveMs,
  solverStats: {
    improvedNodeCount: assignedNodeCount,
    improvedRouteCount,
    nodeAssignmentMargin: resolvedNodeAssignmentMargin,
    sampleCount: assignedNodeCount,
    totalStepsPerNode: resolvedTotalStepsPerNode,
  },
  totalMs,
  totalStepsPerNode: resolvedTotalStepsPerNode,
  unprofiledSolveOverheadMs: solveMs - profiledRunMs,
  phaseMs,
  counts,
  slowestRuns,
}

if (values.json) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  console.log(
    `Direct HighDensityForceImproveSolver benchmark: ${summary.sampleCount} input samples, ${summary.assignedNodeCount} solver nodes, ${summary.inputRouteCount} routes, ${summary.iterations} iterations.`,
  )
  console.log(
    `Total ${formatMs(summary.totalMs)} = constructor ${formatMs(
      summary.constructorMs,
    )} + solve ${formatMs(summary.solveMs)}.`,
  )
  console.log(
    `Profiled force-improve time: ${formatMs(
      summary.profiledRunMs,
    )}; unprofiled solve overhead: ${formatMs(
      summary.unprofiledSolveOverheadMs,
    )}.`,
  )

  if (phaseEntries.length > 0) {
    console.log("")
    console.log("Bottleneck phases:")
    for (const [phaseName, phaseMsValue] of phaseEntries) {
      const share =
        summary.profiledRunMs > 0 ? phaseMsValue / summary.profiledRunMs : 0
      console.log(
        `- ${phaseName}: ${formatMs(phaseMsValue)} (${(share * 100).toFixed(
          1,
        )}%)`,
      )
    }
  }

  if (counts) {
    console.log("")
    console.log("Loop counters:")
    console.log(
      `- element-segment: ${counts.elementSegmentPairChecks.toLocaleString()} checks, ${counts.elementSegmentDistanceChecks.toLocaleString()} distance checks, ${counts.elementSegmentInteractions.toLocaleString()} active interactions`,
    )
    console.log(
      `- projection element-segment: ${counts.projectionElementSegmentPairChecks.toLocaleString()} checks, ${counts.projectionElementSegmentDistanceChecks.toLocaleString()} distance checks, ${counts.projectionElementSegmentCorrections.toLocaleString()} corrections`,
    )
    console.log(
      `- via-via: ${counts.viaViaPairChecks.toLocaleString()} checks, ${counts.viaViaDistanceChecks.toLocaleString()} distance checks, ${counts.viaViaInteractions.toLocaleString()} active interactions`,
    )
    console.log(
      `- projection via-via: ${counts.projectionViaViaPairChecks.toLocaleString()} checks, ${counts.projectionViaViaDistanceChecks.toLocaleString()} distance checks, ${counts.projectionViaViaCorrections.toLocaleString()} corrections`,
    )
  }

  if (slowestRuns.length > 0) {
    console.log("")
    console.log(`Slowest ${slowestRuns.length} nodes:`)
    for (const run of slowestRuns) {
      console.log(
        `- ${run.label ?? "(unknown)"}: ${formatMs(run.elapsedMs)}, routes=${
          run.routeCount
        }, elements=${run.forceElementCount}, segments=${run.segmentCount}`,
      )
    }
  }
}
