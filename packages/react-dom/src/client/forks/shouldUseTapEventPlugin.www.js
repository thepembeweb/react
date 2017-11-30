/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import invariant from 'fbjs/lib/invariant';

const shouldUseTapEventPlugin = require('shouldUseTapEventPlugin');
invariant(
  typeof shouldUseTapEventPlugin === 'boolean',
  'Expected shouldUseTapEventPlugin to export a boolean.',
);

export default shouldUseTapEventPlugin;
