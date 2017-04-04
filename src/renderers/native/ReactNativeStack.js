/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactNativeStack
 * @flow
 */
'use strict';

var NativeMethodsMixin = require('NativeMethodsMixin');
var ReactNativeComponentTree = require('ReactNativeComponentTree');
var ReactNativeInjection = require('ReactNativeInjection');
var ReactNativeMount = require('ReactNativeMount');
var ReactNativeStackInjection = require('ReactNativeStackInjection');
var ReactUpdates = require('ReactUpdates');

var findNodeHandle = require('findNodeHandle');
var takeSnapshot = require('takeSnapshot');

ReactNativeInjection.inject();
ReactNativeStackInjection.inject();

var render = function(
  element: ReactElement<any>,
  mountInto: number,
  callback?: ?() => void,
): ?ReactComponent<any, any, any> {
  return ReactNativeMount.renderComponent(element, mountInto, callback);
};

var ReactNative = {
  hasReactNativeInitialized: false,

  // External users of findNodeHandle() expect the host tag number return type.
  // The injected findNodeHandle() strategy returns the instance wrapper though.
  // See NativeMethodsMixin#setNativeProps for more info on why this is done.
  findNodeHandle(componentOrHandle: any): ?number {
    const nodeHandle = findNodeHandle(componentOrHandle);
    if (nodeHandle == null || typeof nodeHandle === 'number') {
      return nodeHandle;
    }
    return nodeHandle.getHostNode();
  },

  render: render,

  takeSnapshot,

  unmountComponentAtNode: ReactNativeMount.unmountComponentAtNode,

  /* eslint-disable camelcase */
  unstable_batchedUpdates: ReactUpdates.batchedUpdates,
  /* eslint-enable camelcase */

  unmountComponentAtNodeAndRemoveContainer: ReactNativeMount.unmountComponentAtNodeAndRemoveContainer,

  // Expose some internals from the flat bundle.
  // Ideally we should trim this list down as we remove those dependencies.
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    createReactNativeComponentClass: require('createReactNativeComponentClass'),
    findNodeHandle: require('findNodeHandle'),
    NativeMethodsMixin: require('NativeMethodsMixin'),
    PooledClass: require('PooledClass'),
    ReactDebugTool: require('ReactDebugTool'),
    ReactErrorUtils: require('ReactErrorUtils'),
    ReactNativeComponentTree: require('ReactNativeComponentTree'),
    ReactNativePropRegistry: require('ReactNativePropRegistry'),
    ReactPerf: require('ReactPerf'),
    TouchHistoryMath: require('TouchHistoryMath'),
  },
};

// Inject the runtime into a devtools global hook regardless of browser.
// Allows for debugging when the hook is injected on the page.
/* globals __REACT_DEVTOOLS_GLOBAL_HOOK__ */
if (
  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined' &&
  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.inject === 'function'
) {
  __REACT_DEVTOOLS_GLOBAL_HOOK__.inject({
    ComponentTree: {
      getClosestInstanceFromNode: function(node) {
        return ReactNativeComponentTree.getClosestInstanceFromNode(node);
      },
      getNodeFromInstance: function(inst) {
        // inst is an internal instance (but could be a composite)
        while (inst._renderedComponent) {
          inst = inst._renderedComponent;
        }
        if (inst) {
          return ReactNativeComponentTree.getNodeFromInstance(inst);
        } else {
          return null;
        }
      },
    },
    Mount: ReactNativeMount,
    Reconciler: require('ReactReconciler'),
  });
}

// Work around circular dependencies
NativeMethodsMixin.__injectReactNative(ReactNative);
takeSnapshot.__injectReactNative(ReactNative);
require('createReactNativeComponentClass').__injectStackReactNativeBaseComponent(
  require('ReactNativeBaseComponent')
);

module.exports = ReactNative;
