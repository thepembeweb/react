/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails react-core
 */

'use strict';

var React = require('React');
var ReactDOM = require('ReactDOM');

describe('JestBug', () => {
  it('should not stall', () => {
    var container = document.createElement('div');
    ReactDOM.render(<div />, container);
    expect(container.firstChild).toBe(null);
  });
});