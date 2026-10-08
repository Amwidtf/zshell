const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro config extended for the npm-workspaces monorepo:
 * packages/* are watched, and module resolution looks at the hoisted
 * root node_modules in addition to the app's own.
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
