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

module.exports = config
