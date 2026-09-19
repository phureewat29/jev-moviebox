import { ManagedRuntime } from "effect";
import * as JevModel from "./JevModel.ts";

/** One runtime for the process. The model is the labels' model and not configurable: a different one would answer a different rubric. */
export const runtime = ManagedRuntime.make(JevModel.layer({ model: JevModel.PINNED_MODEL }));
