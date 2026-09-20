// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config")

// Must load before Metro starts crawling — see the file for why this exists.
require("./scripts/limit-open-files.cjs")

const config = getDefaultConfig(__dirname)

// lottie-react-native plays `.lottie` files, but Metro only bundles extensions it knows as assets —
// without this it reads the zip as a JavaScript module and the bundle fails.
config.resolver.assetExts.push("lottie")

const path = require("path")

/**
 * A directory under this project root, as a `blockList` pattern.
 *
 * `blockList` is tested against absolute paths, and on Windows Metro tests it twice in two
 * spellings: the crawler and the resolver use the native `C:\...` form, the file watcher first
 * turns every `\` into `/`. A pattern written for one spelling is invisible to the other — which
 * is how `/[\/]\.claude[\/]worktrees[\/]/` once let a worktree crawl and bundle normally but never
 * watched a single edit in it: the pattern only matched the watcher's `/` form. Every separator
 * here, in the root and in the segments, therefore accepts either character.
 *
 * Anchored to `__dirname` rather than matching anywhere: a worktree lives under
 * `<root>/.claude/worktrees/<name>/`, so an unanchored pattern started from inside one matches
 * the whole project it is serving.
 */
const under = (...segments) => {
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const sep = "[\\\\/]"
  const root = __dirname.split(path.sep).map(escape).join(sep)
  return new RegExp(`^${root}${sep}${segments.map(escape).join(sep)}${sep}`)
}

// The VS Code Local History extension writes a timestamped copy of every saved file into
// .history/. It is git-ignored, but Metro does not read .gitignore, so the crawler picks up
// every copy and the file map grows on every save.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]),
  under(".history"),
  // Same shape: the worktrees other sessions open under .claude/ are a full copy of the tree.
  under(".claude", "worktrees"),
]

// moti -> framer-motion -> @motionone/dom requires tslib as CJS, but tslib's package.json
// `exports` map sends Metro's package-exports resolver down the ESM branch, so the CJS output
// destructures `tslib.default`, which is undefined there ("Cannot destructure property
// '__extends' of 'tslib.default'"). Turning off unstable_enablePackageExports globally isn't an
// option either — morphicons has no `main` field at all, only subpaths declared in `exports`
// (e.g. "./react-native"), so disabling it breaks that import instead.
//
// A fixed path doesn't work either: pnpm never hoists a deep transitive dep like tslib to
// node_modules/tslib, so a hardcoded path 404s ("Failed to get the SHA-1 for ... tslib.js") —
// it only exists nested under node_modules/.pnpm/tslib@*/node_modules/tslib. Instead, resolve it
// with Node's own require.resolve from the importing file's location: that walks pnpm's nested
// node_modules correctly, and — because require.resolve applies CJS ("require") conditions, not
// "import" — it picks tslib's `default` (CJS) build instead of the ESM one.
const { resolveRequest: originalResolveRequest } = config.resolver
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "tslib" || moduleName.startsWith("tslib/")) {
    return {
      filePath: require.resolve(moduleName, { paths: [path.dirname(context.originModulePath)] }),
      type: "sourceFile",
    }
  }
  if (originalResolveRequest) return originalResolveRequest(context, moduleName, platform)
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
