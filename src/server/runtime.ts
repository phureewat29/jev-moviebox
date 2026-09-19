import { ManagedRuntime } from "effect";
import * as JevModel from "./JevModel.ts";

/** One runtime per process; the model is the labels' model and not configurable. */
export const runtime = ManagedRuntime.make(JevModel.layer({ model: JevModel.PINNED_MODEL }));
