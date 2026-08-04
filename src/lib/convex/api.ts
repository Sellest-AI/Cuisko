/**
 * The ONLY file in `src/` or `app/` that may import `convex/_generated` (ADR 0006, lint R3).
 *
 * One small seam means a change to the generated API surface has exactly one place to land, and
 * `src/ui/` has no path to the backend even by accident.
 *
 * The import is relative on purpose: `@convex/*` exists only in the Convex TypeScript project,
 * so from `src/` it would not resolve — see docs/ARCHITECTURE.md § Path aliases.
 */
import { api as convexApi } from "../../../convex/_generated/api";

export type { Doc, Id } from "../../../convex/_generated/dataModel";

export const api = convexApi;
export type Api = typeof api;
