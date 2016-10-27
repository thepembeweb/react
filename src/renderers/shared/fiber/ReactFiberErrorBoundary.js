/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactFiberErrorBoundary
 * @flow
 */

import type { Fiber } from 'ReactFiber';

var {
  ClassComponent,
} = require('ReactTypeOfWork');

function findClosestErrorBoundary(fiber : Fiber): ?Fiber {
  let maybeErrorBoundary = fiber.return;
  while (maybeErrorBoundary) {
    if (maybeErrorBoundary.tag === ClassComponent) {
      const instance = maybeErrorBoundary.stateNode;
      if (typeof instance.unstable_handleError === 'function') {
        return maybeErrorBoundary;
      }
    }
    maybeErrorBoundary = maybeErrorBoundary.return;
  }
  return null;
}

function captureError(fiber, error, tag) {
  return {
    boundary: findClosestErrorBoundary(fiber),
    error,
    tag,
  };
}

function sendErrorToBoundary(boundary, error) {
  const instance = boundary.stateNode;
  instance.unstable_handleError(error);
}

exports.captureError = captureError;
exports.sendErrorToBoundary = sendErrorToBoundary;
exports.ReactTypeOfError = {
  BeginOrCompleteWork: 0,
  CommitWork: 1,
  CommitLifeCycles: 2
};

