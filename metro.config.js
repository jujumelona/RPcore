const path = require('path');

const { getSentryExpoConfig } = (() => {
  try {
    return require('@sentry/react-native/metro');
  } catch {
    return { getSentryExpoConfig: null };
  }
})();

const baseConfig = getSentryExpoConfig
  ? getSentryExpoConfig(__dirname)
  : require('expo/metro-config').getDefaultConfig(__dirname);

const baseBlockList = baseConfig?.resolver?.blockList;
const normalizedBaseBlockList = Array.isArray(baseBlockList)
  ? baseBlockList
  : baseBlockList
    ? [baseBlockList]
    : [];

// Ignore large, non-source directories that can stall watcher startup on Windows.
const projectBlockList = [
  /[\\/]\.gradle-local[\\/].*/,
  /[\\/]\.tmp-export[\\/].*/,
  /[\\/]android[\\/](?:app[\\/])?build[\\/].*/,
  /[\\/]android[\\/]\.gradle[\\/].*/,
  /[\\/]\.wrangler[\\/].*/,
];

// Shim map for subpath imports that aren't exposed by installed package versions.
// These are resolved via resolveRequest (which applies to ALL import origins,
// including node_modules) rather than extraNodeModules (which only applies to
// imports from project source files).
const shimMap = {
  'zod/v4': path.resolve(__dirname, 'src/shims/zod-v4'),
  'zod/v4/core': path.resolve(__dirname, 'src/shims/zod-v4-core'),
  'zod/v3': path.resolve(__dirname, 'src/shims/zod-v3'),
};

module.exports = {
  ...baseConfig,
  projectRoot: path.resolve(__dirname),
  watchFolders: [path.resolve(__dirname)],
  resolver: {
    ...(baseConfig.resolver || {}),
    blockList: [...normalizedBaseBlockList, ...projectBlockList],
    extraNodeModules: {
      ...((baseConfig.resolver && baseConfig.resolver.extraNodeModules) || {}),
      events: require.resolve('events'),
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        'src/storage/asyncStorageMMKV'
      ),
      // Keep these here for project-source imports; resolveRequest handles node_modules.
      'zod/v4': path.resolve(__dirname, 'src/shims/zod-v4'),
      'zod/v4/core': path.resolve(__dirname, 'src/shims/zod-v4-core'),
      'zod/v3': path.resolve(__dirname, 'src/shims/zod-v3'),
    },
    resolveRequest: (context, moduleName, platform) => {
      if (shimMap[moduleName]) {
        return {
          filePath: shimMap[moduleName] + '.ts',
          type: 'sourceFile',
        };
      }
      // Fall back to Metro's default resolution for everything else.
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};
