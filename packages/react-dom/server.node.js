/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

'use strict';

import * as ReactDOMServerNode from './src/server/ReactDOMServerNode';

// import {renderToString} from 'react-dom/server';
// var {renderToString} = require('react-dom/server');
// var ReactDOMServerNode = require('react-dom/server');
export * from './src/server/ReactDOMServerNode';

// import ReactDOMServerNode from 'react-dom/server';
// var ReactDOMServerNode = require('react-dom/server').default;
export default ReactDOMServerNode;
