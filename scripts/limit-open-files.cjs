/**
 * Bounds how many files Metro may hold open at once, dev-tooling only.
 *
 * `@expo/metro-file-map`'s in-band worker reads every module's contents with a bare
 * `fs.promises.readFile` (build/worker.js `getContent`), and Metro traverses the whole
 * dependency graph through an unbounded `Promise.all`
 * (metro/src/DeltaBundler/buildSubgraph.js). Nothing between the two caps concurrency, so
 * in-flight reads scale with the module count — measured peak here is ~5.6k, and
 * `web.output: "static"` doubles the pressure because the client bundle and the SSR render
 * bundle build at the same time.
 *
 * Windows caps a Node process at 8192 descriptors, so crossing it throws EMFILE. `@expo/cli`
 * only recovers from EMFILE on darwin (utils/errors.js `handleTooManyOpenFileErrors`), so on
 * Windows the dev server dies with a raw stack trace instead.
 *
 * This is a workaround for an upstream defect, not a design choice: delete it once
 * metro-file-map bounds its own fan-out.
 */
const fs = require("node:fs")

const MAX_CONCURRENT_READS = 512

const createLimiter = (max) => {
  let active = 0
  const pending = []

  const release = () => {
    active -= 1
    const next = pending.shift()
    if (next) next()
  }

  return (task) =>
    new Promise((resolve, reject) => {
      const run = () => {
        active += 1
        task().then(resolve, reject).finally(release)
      }
      if (active < max) run()
      else pending.push(run)
    })
}

// Only whole-file helpers are wrapped. They open, read and close within the single call, so
// the slot maps to a descriptor actually held. `open()` hands its descriptor back to the
// caller and would release the slot while the file is still open, which bounds nothing.
const limit = createLimiter(MAX_CONCURRENT_READS)

for (const method of ["readFile", "writeFile"]) {
  const original = fs.promises[method]
  fs.promises[method] = (...args) => limit(() => original(...args))
}
