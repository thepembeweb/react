/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

'use strict';

import * as ReactDOMServerBrowser from './src/server/ReactDOMServerBrowser';

// import {renderToString} from 'react-dom/server';
// var {renderToString} = require('react-dom/server');
// var ReactDOMServerBrowser = require('react-dom/server');
export * from './src/server/ReactDOMServerBrowser';

// import ReactDOMServerBrowser from 'react-dom/server';
// var ReactDOMServerBrowser = require('react-dom/server').default;
export default ReactDOMServerBrowser;
