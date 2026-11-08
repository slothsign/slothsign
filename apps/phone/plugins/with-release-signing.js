const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE_SIGNING_CONFIG = `signingConfigs {
        release {
            // Left unset without the variable, so a release build fails instead of using the debug key.
            def keystorePath = System.getenv('SLOTHSIGNER_KEYSTORE_PATH')
            if (keystorePath) {
                storeFile file(keystorePath)
                storePassword System.getenv('SLOTHSIGNER_KEYSTORE_PASSWORD')
                keyAlias 'slothsigner'
                keyPassword System.getenv('SLOTHSIGNER_KEYSTORE_PASSWORD')
            }
        }
`;

const RELEASE_BUILD_TYPE =
  /(buildTypes \{[\s\S]*?release \{[^}]*?signingConfig signingConfigs\.)debug/;

function useReleaseKey(gradle) {
  if (gradle.includes("SLOTHSIGNER_KEYSTORE_PATH")) return gradle;
  if (!RELEASE_BUILD_TYPE.test(gradle) || !gradle.includes("signingConfigs {\n")) {
    throw new Error("Could not find the release signing settings in build.gradle");
  }
  return gradle
    .replace(RELEASE_BUILD_TYPE, "$1release")
    .replace("signingConfigs {\n", RELEASE_SIGNING_CONFIG);
}

module.exports = (config) =>
  withAppBuildGradle(config, (result) => {
    result.modResults.contents = useReleaseKey(result.modResults.contents);
    return result;
  });
