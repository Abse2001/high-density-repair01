import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import {
  repairSample,
  type RepairSampleOptions,
  type RepairSampleResult,
} from "./repair"
import type { HighDensityRepair01Input } from "./types"
import { visualizeHighDensityRepair } from "./visualizeHighDensityRepair"

export class HighDensityRepair01 extends BaseSolver {
  repairResult: RepairSampleResult | null = null

  constructor(
    public inputParams: HighDensityRepair01Input,
    public repairOptions: RepairSampleOptions = {},
  ) {
    super()
  }

  override getConstructorParams() {
    return {
      inputParams: this.inputParams,
      repairOptions: this.repairOptions,
    }
  }

  override _step() {
    this.repairResult = repairSample(this.inputParams, this.repairOptions)
    this.stats = {
      ...this.stats,
      finalIssueCount: this.repairResult.finalDrc.issues.length,
      improved: this.repairResult.improved,
      issueCountDelta: this.repairResult.issueCountDelta,
      normalizedIssueCount: this.repairResult.normalizedDrc.issues.length,
      originalIssueCount: this.repairResult.originalDrc.issues.length,
      repaired: this.repairResult.repaired,
      selectedStage: this.repairResult.selectedStage,
      simplifiedIssueCount: this.repairResult.simplifiedDrc.issues.length,
      stepsCompleted: this.repairResult.forceImproveResult.stepsCompleted,
    }
    this.solved = true
  }

  override getOutput(): HighDensityRepair01Input {
    return this.repairResult?.sample ?? this.inputParams
  }

  getRepairResult(): RepairSampleResult | null {
    return this.repairResult
  }

  getVisualizedSample(): HighDensityRepair01Input {
    return this.repairResult?.sample ?? this.inputParams
  }

  override visualize(): GraphicsObject {
    return visualizeHighDensityRepair(this)
  }
}
