'use strict';

const path = require('path');
const bundleTypes = require('./bundles').bundleTypes;
const moduleTypes = require('./bundles').moduleTypes;
const extractErrorCodes = require('../error-codes/extract-errors');

const UMD_DEV = bundleTypes.UMD_DEV;
const UMD_PROD = bundleTypes.UMD_PROD;
const NODE_DEV = bundleTypes.NODE_DEV;
const NODE_PROD = bundleTypes.NODE_PROD;
const FB_DEV = bundleTypes.FB_DEV;
const FB_PROD = bundleTypes.FB_PROD;
const RN_DEV = bundleTypes.RN_DEV;
const RN_PROD = bundleTypes.RN_PROD;

const ISOMORPHIC = moduleTypes.ISOMORPHIC;
const RENDERER = moduleTypes.RENDERER;

// Bundles exporting globals that other modules rely on.
const knownExternalGlobals = Object.freeze({
  'react': 'React',
  'react-dom': 'ReactDOM',
});

// Redirect some modules to Haste forks in www.
const forkedFBModules = Object.freeze({
  // At FB, we don't know them statically:
  'shared/ReactFeatureFlags': 'ReactFeatureFlags',
  // This logic is also forked internally.
  'shared/lowPriorityWarning': 'lowPriorityWarning',
  // In FB bundles, we preserve an inline require to ReactCurrentOwner.
  // See the explanation in FB version of ReactCurrentOwner in www:
  'react/src/ReactCurrentOwner': 'ReactCurrentOwner',
});

function getExternalGlobals(externals, bundleType, moduleType, entry) {
  const externalGlobals = {};

  externals.forEach(name => {
    if (!knownExternalGlobals[name] && (
      moduleType === UMD_DEV ||
      moduleType === UMD_PROD
    )) {
      throw new Error('Unknown global for an external: ' + name);
    }
    externalGlobals[name] = knownExternalGlobals[name];
  });

  return externalGlobals;
}

function getThirdPartyDependencies(bundleType, entry) {
  const packageJson = require(
    path.basename(path.dirname(require.resolve(entry))) + '/package.json'
  );
  return Array.from(new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
  ]));
}

function getModuleAliases(bundleType, entry) {
  switch (bundleType) {
    case UMD_DEV:
    case UMD_PROD:
      if (getThirdPartyDependencies(entry).indexOf('react') !== -1) {
        // Optimization: rely on object-assign polyfill that is already a part
        // of the React package instead of bundling it again.
        return {
          'object-assign': path.resolve(__dirname + '/shims/rollup/assign.js')
        };
      }
      return {};
    case FB_DEV:
    case FB_PROD:
      // TODO: validate
      let aliases = {};
      Object.keys(forkedFBModules).forEach(key => {
        aliases[require.resolve(key)] = forkedFBModules[key];
      })
      return aliases;
    default:
      return {};
  }
}

function getForkedModules(bundleType) {
  switch (bundleType) {
    case FB_DEV:
    case FB_PROD:
      return Object.values(forkedFBModules);
    default:
      return [];
  }
}

module.exports = {
  getExternalGlobals,
  getThirdPartyDependencies,
  getForkedModules,
  getModuleAliases,
};
