/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

import assign from 'object-assign';
import ReactVersion from 'shared/ReactVersion';
import ReactFeatureFlags from 'shared/ReactFeatureFlags';

import {Component, PureComponent, AsyncComponent} from './ReactBaseClasses';
import {forEach, map, count, toArray, only} from './ReactChildren';
import ReactCurrentOwner from './ReactCurrentOwner';
import {
  createElement as createElementProd,
  createFactory as createFactoryProd,
  cloneElement as cloneElementProd,
  isValidElement,
} from './ReactElement';
import {
  createElementWithValidation as createElementDev,
  createFactoryWithValidation as createFactoryDev,
  cloneElementWithValidation as cloneElementDev,
} from './ReactElementValidator';
import ReactDebugCurrentFrame from './ReactDebugCurrentFrame';

const REACT_FRAGMENT_TYPE =
  (typeof Symbol === 'function' &&
    Symbol.for &&
    Symbol.for('react.fragment')) ||
  0xeacb;

export const Children = {
  map,
  forEach,
  count,
  toArray,
  only,
};

export const createElement = __DEV__ ? createElementDev : createElementProd;
export const cloneElement = __DEV__ ? cloneElementDev : cloneElementProd;
export const createFactory = __DEV__ ? createFactoryDev : createFactoryProd;

export {isValidElement, Component, PureComponent};

export const Fragment = ReactFeatureFlags.enableReactFragment
  ? REACT_FRAGMENT_TYPE
  : undefined;

export const unstable_AsyncComponent = AsyncComponent;
export const version = ReactVersion;

export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
  ReactCurrentOwner,
  // Used by renderers to avoid bundling object-assign twice in UMD bundles:
  assign,
};

if (__DEV__) {
  Object.assign(__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED, {
    // These should not be included in production.
    ReactDebugCurrentFrame,
    // Shim for React DOM 16.0.0 which still destructured (but not used) this.
    // TODO: remove in React 17.0.
    ReactComponentTreeHook: {},
  });
}
