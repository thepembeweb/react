/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

'use strict';

import type {ReactNativeRTType} from './src/ReactNativeRTTypes';

import * as ReactNativeRT from './src/ReactNativeRT';

(ReactNativeRT: ReactNativeRTType);

// import {render} from 'react-rt-renderer';
// var {render} = require('react-rt-renderer');
// var ReactNativeRT = require('react-rt-renderer');
export * from './src/ReactNativeRT';
