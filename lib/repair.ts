import { type DrcCheckResult, runDrcCheck } from "./drc-check"
import {
  type ForceImproveOptions,
  type ForceImproveResult,
  runForceDirectedImprovement,
} from "./force-improve"
import { normalizeRoutesToPortAttachments } from "./normalize-routes"
import { simplifyRoutes } from "./simplify"
import type { HighDensityRepair01Input, NodeHdRoute } from "./types"

export const DEFAULT_REPAIR_TARGET_SEGMENTS = 10
export const DEFAULT_FORCE_IMPROVEMENT_PASSES = 100

export type RepairStage =
  | "original"
  | "normalized"
  | "simplified"
  | "force-improved"

export type RepairSampleOptions = ForceImproveOptions & {
  forceImprovementPasses?: number
  simplifyBeforeImprove?: boolean
  targetSegments?: number
}

export type RepairSampleResult = {
  finalDrc: DrcCheckResult
  forceImprovementPasses: number
  forceImproveResult: ForceImproveResult
  improved: boolean
  issueCountDelta: number
  normalizedDrc: DrcCheckResult
  normalizedRoutes: NodeHdRoute[]
  originalDrc: DrcCheckResult
  repaired: boolean
  sample: HighDensityRepair01Input
  selectedStage: RepairStage
  simplifiedDrc: DrcCheckResult
  simplifiedRoutes: NodeHdRoute[]
}

const cloneRoutes = (routes: NodeHdRoute[]): NodeHdRoute[] =>
  routes.map((route) => ({
    ...route,
    route: route.route.map((point) => ({ ...point })),
    vias: route.vias.map((via) => ({ ...via })),
    viaRegions: route.viaRegions?.map((viaRegion) => ({
      ...viaRegion,
      center: { ...viaRegion.center },
      connectedTo: [...viaRegion.connectedTo],
    })),
  }))

const isBetterDrcResult = (
  candidate: DrcCheckResult,
  bestSoFar: DrcCheckResult,
) => {
  if (candidate.ok !== bestSoFar.ok) {
    return candidate.ok
  }

  return candidate.issues.length < bestSoFar.issues.length
}

export const repairSample = (
  sample: HighDensityRepair01Input,
  options: RepairSampleOptions = {},
): RepairSampleResult => {
  const originalRoutes = cloneRoutes(sample.nodeHdRoutes)
  const originalDrc = runDrcCheck(sample.nodeWithPortPoints, originalRoutes)
  const normalizedRoutes = normalizeRoutesToPortAttachments(
    sample.nodeWithPortPoints,
    originalRoutes,
  )
  const normalizedDrc = runDrcCheck(sample.nodeWithPortPoints, normalizedRoutes)

  const simplifiedRoutes =
    options.simplifyBeforeImprove === false
      ? cloneRoutes(normalizedRoutes)
      : simplifyRoutes(
          normalizedRoutes,
          options.targetSegments ?? DEFAULT_REPAIR_TARGET_SEGMENTS,
        )
  const simplifiedDrc = runDrcCheck(sample.nodeWithPortPoints, simplifiedRoutes)

  const forceImprovementPasses =
    options.forceImprovementPasses ?? DEFAULT_FORCE_IMPROVEMENT_PASSES
  const forceImproveResult =
    forceImprovementPasses > 0
      ? runForceDirectedImprovement(
          sample,
          simplifiedRoutes,
          forceImprovementPasses,
          {
            includeForceVectors: options.includeForceVectors,
          },
        )
      : {
          routes: cloneRoutes(simplifiedRoutes),
          forceVectors: [],
          stepsCompleted: 0,
        }
  const improvedDrc = runDrcCheck(
    sample.nodeWithPortPoints,
    forceImproveResult.routes,
  )

  let selectedStage: RepairStage = "original"
  let selectedRoutes = originalRoutes
  let finalDrc = originalDrc

  if (isBetterDrcResult(normalizedDrc, finalDrc)) {
    selectedStage = "normalized"
    selectedRoutes = normalizedRoutes
    finalDrc = normalizedDrc
  }

  if (isBetterDrcResult(simplifiedDrc, finalDrc)) {
    selectedStage = "simplified"
    selectedRoutes = simplifiedRoutes
    finalDrc = simplifiedDrc
  }

  if (isBetterDrcResult(improvedDrc, finalDrc)) {
    selectedStage = "force-improved"
    selectedRoutes = forceImproveResult.routes
    finalDrc = improvedDrc
  }

  return {
    finalDrc,
    forceImprovementPasses,
    forceImproveResult,
    improved: finalDrc.issues.length < originalDrc.issues.length,
    issueCountDelta: originalDrc.issues.length - finalDrc.issues.length,
    normalizedDrc,
    normalizedRoutes,
    originalDrc,
    repaired: !originalDrc.ok && finalDrc.ok,
    sample: {
      ...sample,
      nodeHdRoutes: cloneRoutes(selectedRoutes),
    },
    selectedStage,
    simplifiedDrc,
    simplifiedRoutes,
  }
}
