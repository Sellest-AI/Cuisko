/* `import.meta.glob` is a Vite transform, not a language feature. Vitest applies it at test time —
 * convex-test needs the resulting module map to run Convex functions in-process — but the types
 * ship in `vite/client`, which we deliberately do not pull in: this is the Convex backend project,
 * and `vite/client` would also declare `import.meta.env`, `import.meta.hot` and `*.css` modules
 * that do not exist in the Convex runtime. (`env` in particular is Zod-validated in env.ts — a
 * second, unvalidated `import.meta.env` typing would be actively misleading.)
 *
 * So we declare exactly the one member we use. The lazy (non-eager) form is the only one supported;
 * if you need `{ eager: true }`, widen this signature deliberately rather than reaching for
 * `vite/client`.
 *
 * Convex's bundler skips files containing multiple dots, so this never reaches a deployment.
 */
declare interface ImportMeta {
  glob: (pattern: string) => Record<string, () => Promise<unknown>>;
}
