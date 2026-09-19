import { ManagedRuntime } from "effect";
import * as JevModel from "./JevModel.ts";

/** One runtime per process. */
export const runtime = ManagedRuntime.make(JevModel.layer({ model: JevModel.MODEL }));
