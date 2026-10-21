// Learn more: https://docs.expo.dev/versions/latest/sdk/fingerprint/
const { SourceSkips } = require("expo/fingerprint")

/**
 * The fingerprint is the runtime version (app.json `runtimeVersion.policy`), so it decides
 * whether a merge ships as an over-the-air update or needs a new store build.
 *
 * `version` in app.json is hashed by default, which would make the release commit itself look
 * like a native change: every build would bump the version, and the bump would demand a build.
 * The version is a label for the stores, not part of the binary's JS contract, so it is skipped.
 * The default skip is kept alongside it, since setting `sourceSkips` replaces it.
 */
/** @type {import('expo/fingerprint').Config} */
const config = {
  sourceSkips: SourceSkips.ExpoConfigVersions | SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun,
}

module.exports = config
