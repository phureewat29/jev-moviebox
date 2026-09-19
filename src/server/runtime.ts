import { ManagedRuntime } from "effect";
import * as TypeSafe from "@/core/providers/TypeSafe";

/**
 * One runtime for the process, built from the environment. Route handlers run effects against
 * it rather than building a client per request.
 */
export const runtime = ManagedRuntime.make(TypeSafe.layerConfig);
