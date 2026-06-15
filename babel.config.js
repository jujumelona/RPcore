module.exports = function (api) {
  api.cache(true);

  const isProd = process.env.NODE_ENV === 'production';
  const plugins = [];

  if (isProd) {
    try {
      require.resolve('babel-plugin-transform-remove-console');
      plugins.push(['transform-remove-console', { exclude: ['error'] }]);
    } catch {
      // Optional optimization plugin is missing; skip safely.
    }
  }

  // react-native-reanimated/plugin must be listed LAST
  plugins.push('react-native-reanimated/plugin');

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
