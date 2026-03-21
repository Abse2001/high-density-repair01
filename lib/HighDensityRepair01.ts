import { BaseSolver } from "@tscircuit/solver-utils";
import type { GraphicsObject } from "graphics-debug";
import type { HighDensityRepair01Input } from "./types";

export class HighDensityRepair01 extends BaseSolver {
	constructor(public inputParams: HighDensityRepair01Input) {
		super();
	}

	override getConstructorParams(): HighDensityRepair01Input | undefined {
		return this.inputParams;
	}

	override _step() {}

	override visualize(): GraphicsObject {
		return {} as GraphicsObject;
	}
}
