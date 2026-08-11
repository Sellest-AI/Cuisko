// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config")

// Must load before Metro starts crawling — see the file for why this exists.
require("./scripts/limit-open-files.cjs")

const config = getDefaultConfig(__dirname)

// The VS Code Local History extension writes a timestamped copy of every saved file into
// .history/. It is git-ignored, but Metro does not read .gitignore, so the crawler picks up
// every copy and the file map grows on every save.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]),
  /[\/]\.history[\/]/,
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
const path = require("path")
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
