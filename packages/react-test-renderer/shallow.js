/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

'use strict';

var ReactShallowRenderer = require('./src/ReactShallowRenderer').default;

// TODO: can't use ES modules here because existing Node code
// expects the require() result to be the shallow renderer class.
module.exports = ReactShallowRenderer;
