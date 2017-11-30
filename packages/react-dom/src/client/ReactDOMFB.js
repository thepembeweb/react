/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import * as ReactFiberTreeReflection from 'react-reconciler/reflection';
import * as ReactInstanceMap from 'shared/ReactInstanceMap';
import * as EventPluginHub from 'events/EventPluginHub';
import {addUserTimingListener} from 'shared/ReactFeatureFlags';
import shouldUseTapEventPlugin from './shouldUseTapEventPlugin';

import ReactDOM from './ReactDOM';
import * as ReactBrowserEventEmitter from '../events/ReactBrowserEventEmitter';
import * as ReactDOMComponentTree from './ReactDOMComponentTree';
import TapEventPlugin from '../events/TapEventPlugin';

if (shouldUseTapEventPlugin) {
  // TODO: only msite depends on this.
  // Fix up the call sites so we can delete this.
  EventPluginHub.injection.injectEventPluginsByName({TapEventPlugin});
}

Object.assign(
  (ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: any),
  {
    // These are real internal dependencies that are trickier to remove:
    ReactBrowserEventEmitter,
    ReactFiberTreeReflection,
    ReactDOMComponentTree,
    ReactInstanceMap,
    // Perf experiment
    addUserTimingListener,
  },
);

export default ReactDOM;
