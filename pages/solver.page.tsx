import { GenericSolverDebugger } from "@tscircuit/solver-utils/react";
import { HighDensityRepair01 } from "lib/HighDensityRepair01";

export default (
	<GenericSolverDebugger createSolver={() => new HighDensityRepair01()} />
);
