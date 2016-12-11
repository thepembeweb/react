/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactDOMFiber
 * @flow
 */

  var useSyncScheduling = true;

var getContextForSubtree = require('getContextForSubtree');

getContextForSubtree._injectFiber(function(fiber : Fiber) {
  const parentContext = findCurrentUnmaskedContext(fiber);
  return isContextProvider(fiber) ?
    processChildContext(fiber, parentContext) :
    parentContext;
});

// Root
function createReifiedYield(yieldNode : ReactYield) : ReifiedYield {
  var fiber = createFiberFromElementType(
    yieldNode.continuation,
    yieldNode.key
  );
  return {
    continuation: fiber,
    props: yieldNode.props,
  };
};

function createUpdatedReifiedYield(previousYield : ReifiedYield, yieldNode : ReactYield) : ReifiedYield {
  var fiber = previousYield.continuation;
  if (fiber.type !== yieldNode.continuation) {
    fiber = createFiberFromElementType(
      yieldNode.continuation,
      yieldNode.key
    );
  }
  return {
    continuation: fiber,
    props: yieldNode.props,
  };
};


function createFiberRoot(containerInfo : any, context : Object) : FiberRoot {
  // Cyclic construction. This cheats the type system right now because
  // stateNode is any.
  const uninitializedFiber = createHostRootFiber();
  const root = {
    current: uninitializedFiber,
    containerInfo: containerInfo,
    isScheduled: false,
    nextScheduledRoot: null,
    callbackList: null,
    context: context,
    pendingContext: null,
  };
  uninitializedFiber.stateNode = root;
  return root;
};


// FiberScheduler

var ReactCurrentOwner = require('ReactCurrentOwner');

var timeHeuristicForUnitOfWork = 1;

// CommitWork

  // Capture errors so they don't interrupt unmounting.
  function safelyCallComponentWillUnmount(current, instance) {
    try {
      instance.componentWillUnmount();
    } catch (error) {
      captureError(current, error);
    }
  }

  // Capture errors so they don't interrupt unmounting.
  function safelyDetachRef(current : Fiber) {
    try {
      const ref = current.ref;
      if (ref) {
        ref(null);
      }
    } catch (error) {
      captureError(current, error);
    }
  }

  // Only called during update. It's ok to throw.
  function detachRefIfNeeded(current : ?Fiber, finishedWork : Fiber) {
    if (current) {
      const currentRef = current.ref;
      if (currentRef && currentRef !== finishedWork.ref) {
        currentRef(null);
      }
    }
  }

  function attachRef(current : ?Fiber, finishedWork : Fiber, instance : any) {
    const ref = finishedWork.ref;
    if (ref && (!current || current.ref !== ref)) {
      ref(instance);
    }
  }

  function getHostParent(fiber : Fiber) : I | C {
    let parent = fiber.return;
    while (parent) {
      switch (parent.tag) {
        case 5:
          return parent.stateNode;
        case 3:
          return parent.stateNode.containerInfo;
        case 4:
          return parent.stateNode.containerInfo;
      }
      parent = parent.return;
    }
    throw new Error('Expected to find a host parent.');
  }

  function getHostParentFiber(fiber : Fiber) : Fiber {
    let parent = fiber.return;
    while (parent) {
      if (isHostParent(parent)) {
        return parent;
      }
      parent = parent.return;
    }
    throw new Error('Expected to find a host parent.');
  }

  function isHostParent(fiber : Fiber) : boolean {
    return (
      fiber.tag === 5 ||
      fiber.tag === 3 ||
      fiber.tag === 4
    );
  }

  function getHostSibling(fiber : Fiber) : ?I {
    // We're going to search forward into the tree until we find a sibling host
    // node. Unfortunately, if multiple insertions are done in a row we have to
    // search past them. This leads to exponential search for the next sibling.
    // TODO: Find a more efficient way to do this.
    let node : Fiber = fiber;
    siblings: while (true) {
      // If we didn't find anything, let's try the next sibling.
      while (!node.sibling) {
        if (!node.return || isHostParent(node.return)) {
          // If we pop out of the root or hit the parent the fiber we are the
          // last sibling.
          return null;
        }
        node = node.return;
      }
      node.sibling.return = node.return;
      node = node.sibling;
      while (node.tag !== 5 && node.tag !== 6) {
        // If it is not host node and, we might have a host node inside it.
        // Try to search down until we find one.
        // TODO: For coroutines, this will have to search the stateNode.
        if (node.effectTag & 1) {
          // If we don't have a child, try the siblings instead.
          continue siblings;
        }
        if (!node.child) {
          continue siblings;
        } else {
          node.child.return = node;
          node = node.child;
        }
      }
      // Check if this host node is stable or about to be placed.
      if (!(node.effectTag & 1)) {
        // Found it!
        return node.stateNode;
      }
    }
  }

  function commitPlacement(finishedWork : Fiber) : void {
    // Recursively insert all host nodes into the parent.
    const parentFiber = getHostParentFiber(finishedWork);
    let parent;
    switch (parentFiber.tag) {
      case 5:
        parent = parentFiber.stateNode;
        break;
      case 3:
        parent = parentFiber.stateNode.containerInfo;
        break;
      case 4:
        parent = parentFiber.stateNode.containerInfo;
        break;
      default:
        throw new Error('Invalid host parent fiber.');
    }
    if (parentFiber.effectTag & 8) {
      // Reset the text content of the parent before doing any insertions
      resetTextContent(parent);
      // Clear 8 from the effect tag
      parentFiber.effectTag &= ~8;
    }

    const before = getHostSibling(finishedWork);
    // We only have the top Fiber that was inserted but we need recurse down its
    // children to find all the terminal nodes.
    let node : Fiber = finishedWork;
    while (true) {
      if (node.tag === 5 || node.tag === 6) {
        if (before) {
          insertBefore(parent, node.stateNode, before);
        } else {
          appendChild(parent, node.stateNode);
        }
      } else if (node.tag === 4) {
        // If the insertion itself is a portal, then we don't want to traverse
        // down its children. Instead, we'll get insertions from each child in
        // the portal directly.
      } else if (node.child) {
        // TODO: Coroutines need to visit the stateNode.
        node.child.return = node;
        node = node.child;
        continue;
      }
      if (node === finishedWork) {
        return;
      }
      while (!node.sibling) {
        if (!node.return || node.return === finishedWork) {
          return;
        }
        node = node.return;
      }
      node.sibling.return = node.return;
      node = node.sibling;
    }
  }

  function commitNestedUnmounts(root : Fiber): void {
    // While we're inside a removed host node we don't want to call
    // removeChild on the inner nodes because they're removed by the top
    // call anyway. We also want to call componentWillUnmount on all
    // composites before this host node is removed from the tree. Therefore
    // we do an inner loop while we're still inside the host node.
    let node : Fiber = root;
    while (true) {
      commitUnmount(node);
      if (node.child) {
        // TODO: Coroutines need to visit the stateNode.
        node.child.return = node;
        node = node.child;
        continue;
      }
      if (node === root) {
        return;
      }
      while (!node.sibling) {
        if (!node.return || node.return === root) {
          return;
        }
        node = node.return;
      }
      node.sibling.return = node.return;
      node = node.sibling;
    }
  }

  function unmountHostComponents(parent, current): void {
    // We only have the top Fiber that was inserted but we need recurse down its
    // children to find all the terminal nodes.
    let node : Fiber = current;
    while (true) {
      if (node.tag === 5 || node.tag === 6) {
        commitNestedUnmounts(node);
        // After all the children have unmounted, it is now safe to remove the
        // node from the tree.
        removeChild(parent, node.stateNode);
      } else if (node.tag === 4) {
        // When we go into a portal, it becomes the parent to remove from.
        // We will reassign it back when we pop the portal on the way up.
        parent = node.stateNode.containerInfo;
        if (node.child) {
          node = node.child;
          continue;
        }
      } else {
        commitUnmount(node);
        if (node.child) {
          // TODO: Coroutines need to visit the stateNode.
          node.child.return = node;
          node = node.child;
          continue;
        }
      }
      if (node === current) {
        return;
      }
      while (!node.sibling) {
        if (!node.return || node.return === current) {
          return;
        }
        node = node.return;
        if (node.tag === 4) {
          // When we go out of the portal, we need to restore the parent.
          // Since we don't keep a stack of them, we will search for it.
          parent = getHostParent(node);
        }
      }
      node.sibling.return = node.return;
      node = node.sibling;
    }
  }

  function commitDeletion(current : Fiber) : void {
    // Recursively delete all host nodes from the parent.
    const parent = getHostParent(current);
    // Detach refs and call componentWillUnmount() on the whole subtree.
    unmountHostComponents(parent, current);

    // Cut off the return pointers to disconnect it from the tree. Ideally, we
    // should clear the child pointer of the parent alternate to let this
    // get GC:ed but we don't know which for sure which parent is the current
    // one so we'll settle for GC:ing the subtree of this child. This child
    // itself will be GC:ed when the parent updates the next time.
    current.return = null;
    current.child = null;
    if (current.alternate) {
      current.alternate.child = null;
      current.alternate.return = null;
    }
  }

  // User-originating errors (lifecycles and refs) should not interrupt
  // deletion, so don't let them throw. Host-originating errors should
  // interrupt deletion, so it's okay
  function commitUnmount(current : Fiber) : void {
    switch (current.tag) {
      case 2: {
        safelyDetachRef(current);
        const instance = current.stateNode;
        if (typeof instance.componentWillUnmount === 'function') {
          safelyCallComponentWillUnmount(current, instance);
        }
        return;
      }
      case 5: {
        safelyDetachRef(current);
        return;
      }
      case 7: {
        commitNestedUnmounts(current.stateNode);
        return;
      }
      case 4: {
        // TODO: this is recursive.
        commitDeletion(current);
        return;
      }
    }
  }

  function commitWork(current : ?Fiber, finishedWork : Fiber) : void {
    switch (finishedWork.tag) {
      case 2: {
        detachRefIfNeeded(current, finishedWork);
        return;
      }
      case 5: {
        const instance : I = finishedWork.stateNode;
        if (instance != null && current) {
          // Commit the work prepared earlier.
          const newProps = finishedWork.memoizedProps;
          const oldProps = current.memoizedProps;
          const rootContainerInstance = getRootHostContainer();
          commitUpdate(instance, oldProps, newProps, rootContainerInstance, finishedWork);
        }
        detachRefIfNeeded(current, finishedWork);
        return;
      }
      case 6: {
        if (finishedWork.stateNode == null || !current) {
          throw new Error('This should only be done during updates.');
        }
        const textInstance : TI = finishedWork.stateNode;
        const newText : string = finishedWork.memoizedProps;
        const oldText : string = current.memoizedProps;
        commitTextUpdate(textInstance, oldText, newText);
        return;
      }
      case 3: {
        return;
      }
      case 4: {
        return;
      }
      default:
        throw new Error('This unit of work tag should not have side-effects.');
    }
  }

  function commitLifeCycles(current : ?Fiber, finishedWork : Fiber) : void {
    switch (finishedWork.tag) {
      case 2: {
        const instance = finishedWork.stateNode;
        if (finishedWork.effectTag & 2) {
          if (!current) {
            if (typeof instance.componentDidMount === 'function') {
              instance.componentDidMount();
            }
          } else {
            if (typeof instance.componentDidUpdate === 'function') {
              const prevProps = current.memoizedProps;
              const prevState = current.memoizedState;
              instance.componentDidUpdate(prevProps, prevState);
            }
          }
          attachRef(current, finishedWork, instance);
        }
        // Clear updates from current fiber.
        if (finishedWork.alternate) {
          finishedWork.alternate.updateQueue = null;
        }
        if (finishedWork.effectTag & 16) {
          if (finishedWork.callbackList) {
            const callbackList = finishedWork.callbackList;
            finishedWork.callbackList = null;
            callCallbacks(callbackList, instance);
          }
        }
        return;
      }
      case 3: {
        const rootFiber = finishedWork.stateNode;
        if (rootFiber.callbackList) {
          const callbackList = rootFiber.callbackList;
          rootFiber.callbackList = null;
          callCallbacks(callbackList, rootFiber.current.child.stateNode);
        }
        return;
      }
      case 5: {
        const instance : I = finishedWork.stateNode;
        attachRef(current, finishedWork, instance);
        return;
      }
      case 6: {
        // We have no life-cycles associated with text.
        return;
      }
      case 4: {
        // We have no life-cycles associated with portals.
        return;
      }
      default:
        throw new Error('This unit of work tag should not have side-effects.');
    }
  }



// CompleteWork

  function markUpdate(workInProgress : Fiber) {
    // Tag the fiber with an update effect. This turns a 1 into
    // an UpdateAndPlacement.
    workInProgress.effectTag |= 2;
  }

  function markCallback(workInProgress : Fiber) {
    // Tag the fiber with a callback effect.
    workInProgress.effectTag |= 16;
  }

  function appendAllYields(yields : Array<ReifiedYield>, workInProgress : Fiber) {
    let node = workInProgress.child;
    while (node) {
      if (node.tag === 5 || node.tag === 6 ||
          node.tag === 4) {
        throw new Error('A coroutine cannot have host component children.');
      } else if (node.tag === 9) {
        yields.push(node.type);
      } else if (node.child) {
        // TODO: Coroutines need to visit the stateNode.
        node.child.return = node;
        node = node.child;
        continue;
      }
      if (node === workInProgress) {
        return;
      }
      while (!node.sibling) {
        if (!node.return || node.return === workInProgress) {
          return;
        }
        node = node.return;
      }
      node.sibling.return = node.return;
      node = node.sibling;
    }
  }

  function moveCoroutineToHandlerPhase(current : ?Fiber, workInProgress : Fiber) {
    var coroutine = (workInProgress.pendingProps : ?ReactCoroutine);
    if (!coroutine) {
      throw new Error('Should be resolved by now');
    }

    // First step of the coroutine has completed. Now we need to do the second.
    // TODO: It would be nice to have a multi stage coroutine represented by a
    // single component, or at least tail call optimize nested ones. Currently
    // that requires additional fields that we don't want to add to the fiber.
    // So this requires nested handlers.
    // Note: This doesn't mutate the alternate node. I don't think it needs to
    // since this stage is reset for every pass.
    workInProgress.tag = 8;

    // Build up the yields.
    // TODO: Compare this to a generator or opaque helpers like Children.
    var yields : Array<ReifiedYield> = [];
    appendAllYields(yields, workInProgress);
    var fn = coroutine.handler;
    var props = coroutine.props;
    var nextChildren = fn(props, yields);

    var currentFirstChild = current ? current.stateNode : null;
    // Inherit the priority of the returnFiber.
    const priority = workInProgress.pendingWorkPriority;
    workInProgress.stateNode = reconcileChildFibers(
      workInProgress,
      currentFirstChild,
      nextChildren,
      priority
    );
    return workInProgress.stateNode;
  }

  function appendAllChildren(parent : I, workInProgress : Fiber) {
    // We only have the top Fiber that was created but we need recurse down its
    // children to find all the terminal nodes.
    let node = workInProgress.child;
    while (node) {
      if (node.tag === 5 || node.tag === 6) {
        appendInitialChild(parent, node.stateNode);
      } else if (node.tag === 4) {
        // If we have a portal child, then we don't want to traverse
        // down its children. Instead, we'll get insertions from each child in
        // the portal directly.
      } else if (node.child) {
        // TODO: Coroutines need to visit the stateNode.
        node = node.child;
        continue;
      }
      if (node === workInProgress) {
        return;
      }
      while (!node.sibling) {
        if (!node.return || node.return === workInProgress) {
          return;
        }
        node = node.return;
      }
      node = node.sibling;
    }
  }

  function completeWork(current : ?Fiber, workInProgress : Fiber) : ?Fiber {
    switch (workInProgress.tag) {
      case 1:
        workInProgress.memoizedProps = workInProgress.pendingProps;
        return null;
      case 2:
        // We are leaving this subtree, so pop context if any.
        if (isContextProvider(workInProgress)) {
          popContextProvider();
        }
        // Don't use the state queue to compute the memoized state. We already
        // merged it and assigned it to the instance. Transfer it from there.
        // Also need to transfer the props, because pendingProps will be null
        // in the case of an update
        const { state, props } = workInProgress.stateNode;
        const updateQueue = workInProgress.updateQueue;
        workInProgress.memoizedState = state;
        workInProgress.memoizedProps = props;
        if (current) {
          if (current.memoizedProps !== workInProgress.memoizedProps ||
              current.memoizedState !== workInProgress.memoizedState ||
              updateQueue && updateQueue.isForced) {
            markUpdate(workInProgress);
          }
        } else {
          markUpdate(workInProgress);
        }
        if (updateQueue && updateQueue.hasCallback) {
          // Transfer update queue to callbackList field so callbacks can be
          // called during commit phase.
          workInProgress.callbackList = updateQueue;
          markCallback(workInProgress);
        }
        return null;
      case 3: {
        workInProgress.memoizedProps = workInProgress.pendingProps;
        popContextProvider();
        const fiberRoot = (workInProgress.stateNode : FiberRoot);
        if (fiberRoot.pendingContext) {
          fiberRoot.context = fiberRoot.pendingContext;
          fiberRoot.pendingContext = null;
        }
        // TODO: Only mark this as an update if we have any pending callbacks
        // on it.
        markUpdate(workInProgress);
        return null;
      }
      case 5:
        popHostContext(workInProgress);
        let newProps = workInProgress.pendingProps;
        if (current && workInProgress.stateNode != null) {
          // If we have an alternate, that means this is an update and we need to
          // schedule a side-effect to do the updates.
          const oldProps = current.memoizedProps;
          // If we get updated because one of our children updated, we don't
          // have newProps so we'll have to reuse them.
          // TODO: Split the update API as separate for the props vs. children.
          // Even better would be if children weren't special cased at all tho.
          if (!newProps) {
            newProps = workInProgress.memoizedProps || oldProps;
          }
          const instance : I = workInProgress.stateNode;
          if (prepareUpdate(instance, oldProps, newProps)) {
            // This returns true if there was something to update.
            markUpdate(workInProgress);
          }
        } else {
          if (!newProps) {
            if (workInProgress.stateNode === null) {
              throw new Error('We must have new props for new mounts.');
            } else {
              // This can happen when we abort work.
              return null;
            }
          }

          const rootContainerInstance = getRootHostContainer();
          const currentHostContext = getHostContext();
          // TODO: Move createInstance to beginWork and keep it on a context
          // "stack" as the parent. Then append children as we go in beginWork
          // or completeWork depending on we want to add then top->down or
          // bottom->up. Top->down is faster in IE11.
          const instance = createInstance(
            workInProgress.type,
            newProps,
            rootContainerInstance,
            currentHostContext,
            workInProgress
          );
          appendAllChildren(instance, workInProgress);
          finalizeInitialChildren(instance, newProps, rootContainerInstance);

          workInProgress.stateNode = instance;
          if (workInProgress.ref) {
            // If there is a ref on a host node we need to schedule a callback
            markUpdate(workInProgress);
          }
        }
        workInProgress.memoizedProps = newProps;
        return null;
      case 6:
        let newText = workInProgress.pendingProps;
        if (current && workInProgress.stateNode != null) {
          const oldText = current.memoizedProps;
          if (newText === null) {
            // If this was a bail out we need to fall back to memoized text.
            // This works the same way as 5.
            newText = workInProgress.memoizedProps;
            if (newText === null) {
              newText = oldText;
            }
          }
          // If we have an alternate, that means this is an update and we need
          // to schedule a side-effect to do the updates.
          if (oldText !== newText) {
            markUpdate(workInProgress);
          }
        } else {
          if (typeof newText !== 'string') {
            if (workInProgress.stateNode === null) {
              throw new Error('We must have new props for new mounts.');
            } else {
              // This can happen when we abort work.
              return null;
            }
          }
          const textInstance = createTextInstance(newText, workInProgress);
          workInProgress.stateNode = textInstance;
        }
        workInProgress.memoizedProps = newText;
        return null;
      case 7:
        return moveCoroutineToHandlerPhase(current, workInProgress);
      case 8:
        workInProgress.memoizedProps = workInProgress.pendingProps;
        // Reset the tag to now be a first phase coroutine.
        workInProgress.tag = 7;
        return null;
      case 9:
        // Does nothing.
        return null;
      case 10:
        workInProgress.memoizedProps = workInProgress.pendingProps;
        return null;
      case 4:
        // TODO: Only mark this as an update if we have any pending callbacks.
        markUpdate(workInProgress);
        workInProgress.memoizedProps = workInProgress.pendingProps;
        popHostContainer();
        return null;

      // Error cases
      case 0:
        throw new Error('An indeterminate component should have become determinate before completing.');
      default:
        throw new Error('Unknown unit of work tag');
    }
  }




// Begin Work

var REACT_ELEMENT_TYPE = require('ReactElementSymbol');
var {
  REACT_COROUTINE_TYPE,
  REACT_YIELD_TYPE,
} = require('ReactCoroutine');
var {
  REACT_PORTAL_TYPE,
} = require('ReactPortal');

var emptyObject = require('emptyObject');
var getIteratorFn = require('getIteratorFn');
var invariant = require('invariant');

// Fiber

if (__DEV__) {
  var debugCounter = 0;
}

// This is a constructor of a POJO instead of a constructor function for a few
// reasons:
// 1) Nobody should add any instance methods on this. Instance methods can be
//    more difficult to predict when they get optimized and they are almost
//    never inlined properly in static compilers.
// 2) Nobody should rely on `instanceof Fiber` for type testing. We should
//    always know when it is a fiber.
// 3) We can easily go from a createFiber call to calling a constructor if that
//    is faster. The opposite is not true.
// 4) We might want to experiment with using numeric keys since they are easier
//    to optimize in a non-JIT environment.
// 5) It should be easy to port this to a C struct and keep a C implementation
//    compatible.
var createFiber = function(tag : TypeOfWork, key : null | string) : Fiber {
  var fiber = {

    // Instance

    tag: tag,

    key: key,

    type: null,

    stateNode: null,

    // Fiber

    return: null,

    child: null,
    sibling: null,
    index: 0,

    ref: null,

    pendingProps: null,
    memoizedProps: null,
    updateQueue: null,
    memoizedState: null,
    callbackList: null,

    effectTag: 0,
    nextEffect: null,
    firstEffect: null,
    lastEffect: null,

    pendingWorkPriority: 0,
    progressedPriority: 0,
    progressedChild: null,
    progressedFirstDeletion: null,
    progressedLastDeletion: null,

    alternate: null,

  };
  if (__DEV__) {
    (fiber : any)._debugID = debugCounter++;
  }
  return fiber;
};

function shouldConstruct(Component) {
  return !!(Component.prototype && Component.prototype.isReactComponent);
}


// This is used to create an alternate fiber to do work on.
// TODO: Rename to createWorkInProgressFiber or something like that.
function cloneFiber(fiber : Fiber, priorityLevel : PriorityLevel) : Fiber {
  // We clone to get a work in progress. That means that this fiber is the
  // current. To make it safe to reuse that fiber later on as work in progress
  // we need to reset its work in progress flag now. We don't have an
  // opportunity to do this earlier since we don't traverse the tree when
  // the work in progress tree becomes the current tree.
  // fiber.progressedPriority = 0;
  // fiber.progressedChild = null;

  // We use a double buffering pooling technique because we know that we'll only
  // ever need at most two versions of a tree. We pool the "other" unused node
  // that we're free to reuse. This is lazily created to avoid allocating extra
  // objects for things that are never updated. It also allow us to reclaim the
  // extra memory if needed.
  let alt = fiber.alternate;
  if (alt) {
    // If we clone, then we do so from the "current" state. The current state
    // can't have any side-effects that are still valid so we reset just to be
    // sure.
    alt.effectTag = 0;
    alt.nextEffect = null;
    alt.firstEffect = null;
    alt.lastEffect = null;
  } else {
    // This should not have an alternate already
    alt = createFiber(fiber.tag, fiber.key);
    alt.type = fiber.type;

    alt.progressedChild = fiber.progressedChild;
    alt.progressedPriority = fiber.progressedPriority;

    alt.alternate = fiber;
    fiber.alternate = alt;
  }

  alt.stateNode = fiber.stateNode;
  alt.child = fiber.child;
  alt.sibling = fiber.sibling; // This should always be overridden. TODO: null
  alt.index = fiber.index; // This should always be overridden.
  alt.ref = fiber.ref;
  // pendingProps is here for symmetry but is unnecessary in practice for now.
  // TODO: Pass in the new pendingProps as an argument maybe?
  alt.pendingProps = fiber.pendingProps;
  alt.updateQueue = fiber.updateQueue;
  alt.callbackList = fiber.callbackList;
  alt.pendingWorkPriority = priorityLevel;

  alt.memoizedProps = fiber.memoizedProps;
  alt.memoizedState = fiber.memoizedState;

  return alt;
};

function createHostRootFiber() : Fiber {
  const fiber = createFiber(3, null);
  return fiber;
};

function createFiberFromElement(element : ReactElement<*>, priorityLevel : PriorityLevel) : Fiber {
// $FlowFixMe: ReactElement.key is currently defined as ?string but should be defined as null | string in Flow.
  const fiber = createFiberFromElementType(element.type, element.key);
  fiber.pendingProps = element.props;
  fiber.pendingWorkPriority = priorityLevel;
  return fiber;
};

function createFiberFromFragment(elements : ReactFragment, priorityLevel : PriorityLevel) : Fiber {
  // TODO: Consider supporting keyed fragments. Technically, we accidentally
  // support that in the existing React.
  const fiber = createFiber(10, null);
  fiber.pendingProps = elements;
  fiber.pendingWorkPriority = priorityLevel;
  return fiber;
};

function createFiberFromText(content : string, priorityLevel : PriorityLevel) : Fiber {
  const fiber = createFiber(6, null);
  fiber.pendingProps = content;
  fiber.pendingWorkPriority = priorityLevel;
  return fiber;
};

function createFiberFromElementType(type : mixed, key : null | string) : Fiber {
  let fiber;
  if (typeof type === 'function') {
    fiber = shouldConstruct(type) ?
      createFiber(2, key) :
      createFiber(0, key);
    fiber.type = type;
  } else if (typeof type === 'string') {
    fiber = createFiber(5, key);
    fiber.type = type;
  } else if (typeof type === 'object' && type !== null) {
    // Currently assumed to be a continuation and therefore is a fiber already.
    // TODO: The yield system is currently broken for updates in some cases.
    // The reified yield stores a fiber, but we don't know which fiber that is;
    // the current or a workInProgress? When the continuation gets rendered here
    // we don't know if we can reuse that fiber or if we need to clone it.
    // There is probably a clever way to restructure this.
    fiber = ((type : any) : Fiber);
  } else {
    invariant(
      false,
      'Element type is invalid: expected a string (for built-in components) ' +
      'or a class/function (for composite components) but got: %s.',
      type == null ? type : typeof type,
      // TODO: Stack also includes owner name in the message.
    );
  }
  return fiber;
}


function createFiberFromCoroutine(coroutine : ReactCoroutine, priorityLevel : PriorityLevel) : Fiber {
  const fiber = createFiber(7, coroutine.key);
  fiber.type = coroutine.handler;
  fiber.pendingProps = coroutine;
  fiber.pendingWorkPriority = priorityLevel;
  return fiber;
};

function createFiberFromYield(yieldNode : ReactYield, priorityLevel : PriorityLevel) : Fiber {
  const fiber = createFiber(9, yieldNode.key);
  fiber.pendingProps = {};
  return fiber;
};

function createFiberFromPortal(portal : ReactPortal, priorityLevel : PriorityLevel) : Fiber {
  const fiber = createFiber(4, portal.key);
  fiber.pendingProps = portal.children;
  fiber.pendingWorkPriority = priorityLevel;
  fiber.stateNode = {
    containerInfo: portal.containerInfo,
    implementation: portal.implementation,
  };
  return fiber;
};


// Child

const isArray = Array.isArray;


function coerceRef(current: ?Fiber, element: ReactElement<any>) {
  let mixedRef = element.ref;
  if (mixedRef != null && typeof mixedRef !== 'function') {
    if (element._owner) {
      const ownerFiber : ?(Fiber | ReactInstance) = (element._owner : any);
      let inst;
      if (ownerFiber) {
        if ((ownerFiber : any).tag === 2) {
          inst = (ownerFiber : any).stateNode;
        } else {
          // Stack
          inst = (ownerFiber : any).getPublicInstance();
        }
      }
      invariant(inst, 'Missing owner for string ref %s', mixedRef);
      const stringRef = String(mixedRef);
      // Check if previous string ref matches new string ref
      if (current && current.ref && current.ref._stringRef === stringRef) {
        return current.ref;
      }
      const ref = function(value) {
        const refs = inst.refs === emptyObject ? (inst.refs = {}) : inst.refs;
        if (value === null) {
          delete refs[stringRef];
        } else {
          refs[stringRef] = value;
        }
      };
      ref._stringRef = stringRef;
      return ref;
    }
  }
  return mixedRef;
}

// This wrapper function exists because I expect to clone the code in each path
// to be able to optimize each path individually by branching early. This needs
// a compiler or we can do it manually. Helpers that don't need this branching
// live outside of this function.
function ChildReconciler(shouldClone, shouldTrackSideEffects) {

  function deleteChild(
    returnFiber : Fiber,
    childToDelete : Fiber
  ) : void {
    if (!shouldTrackSideEffects) {
      // Noop.
      return;
    }
    if (!shouldClone) {
      // When we're reconciling in place we have a work in progress copy. We
      // actually want the current copy. If there is no current copy, then we
      // don't need to track deletion side-effects.
      if (!childToDelete.alternate) {
        return;
      }
      childToDelete = childToDelete.alternate;
    }
    // Deletions are added in reversed order so we add it to the front.
    const last = returnFiber.progressedLastDeletion;
    if (last) {
      last.nextEffect = childToDelete;
      returnFiber.progressedLastDeletion = childToDelete;
    } else {
      returnFiber.progressedFirstDeletion =
        returnFiber.progressedLastDeletion =
          childToDelete;
    }
    childToDelete.nextEffect = null;
    childToDelete.effectTag = 4;
  }

  function deleteRemainingChildren(
    returnFiber : Fiber,
    currentFirstChild : ?Fiber
  ) : null {
    if (!shouldTrackSideEffects) {
      // Noop.
      return null;
    }

    // TODO: For the shouldClone case, this could be micro-optimized a bit by
    // assuming that after the first child we've already added everything.
    let childToDelete = currentFirstChild;
    while (childToDelete) {
      deleteChild(returnFiber, childToDelete);
      childToDelete = childToDelete.sibling;
    }
    return null;
  }

  function mapRemainingChildren(
    returnFiber : Fiber,
    currentFirstChild : Fiber
  ) : Map<string | number, Fiber> {
    // Add the remaining children to a temporary map so that we can find them by
    // keys quickly. Implicit (null) keys get added to this set with their index
    // instead.
    const existingChildren : Map<string | number, Fiber> = new Map();

    let existingChild = currentFirstChild;
    while (existingChild) {
      if (existingChild.key !== null) {
        existingChildren.set(existingChild.key, existingChild);
      } else {
        existingChildren.set(existingChild.index, existingChild);
      }
      existingChild = existingChild.sibling;
    }
    return existingChildren;
  }

  function useFiber(fiber : Fiber, priority : PriorityLevel) : Fiber {
    // We currently set sibling to null and index to 0 here because it is easy
    // to forget to do before returning it. E.g. for the single child case.
    if (shouldClone) {
      const clone = cloneFiber(fiber, priority);
      clone.index = 0;
      clone.sibling = null;
      return clone;
    } else {
      // We override the pending priority even if it is higher, because if
      // we're reconciling at a lower priority that means that this was
      // down-prioritized.
      fiber.pendingWorkPriority = priority;
      fiber.effectTag = 0;
      fiber.index = 0;
      fiber.sibling = null;
      return fiber;
    }
  }

  function placeChild(newFiber : Fiber, lastPlacedIndex : number, newIndex : number) : number {
    newFiber.index = newIndex;
    if (!shouldTrackSideEffects) {
      // Noop.
      return lastPlacedIndex;
    }
    const current = newFiber.alternate;
    if (current) {
      const oldIndex = current.index;
      if (oldIndex < lastPlacedIndex) {
        // This is a move.
        newFiber.effectTag = 1;
        return lastPlacedIndex;
      } else {
        // This item can stay in place.
        return oldIndex;
      }
    } else {
      // This is an insertion.
      newFiber.effectTag = 1;
      return lastPlacedIndex;
    }
  }

  function placeSingleChild(newFiber : Fiber) : Fiber {
    // This is simpler for the single child case. We only need to do a
    // placement for inserting new children.
    if (shouldTrackSideEffects && !newFiber.alternate) {
      newFiber.effectTag = 1;
    }
    return newFiber;
  }

  function updateTextNode(
    returnFiber : Fiber,
    current : ?Fiber,
    textContent : string,
    priority : PriorityLevel
  ) {
    if (current == null || current.tag !== 6) {
      // Insert
      const created = createFiberFromText(textContent, priority);
      created.return = returnFiber;
      return created;
    } else {
      // 2
      const existing = useFiber(current, priority);
      existing.pendingProps = textContent;
      existing.return = returnFiber;
      return existing;
    }
  }

  function updateElement(
    returnFiber : Fiber,
    current : ?Fiber,
    element : ReactElement<any>,
    priority : PriorityLevel
  ) : Fiber {
    if (current == null || current.type !== element.type) {
      // Insert
      const created = createFiberFromElement(element, priority);
      created.ref = coerceRef(current, element);
      created.return = returnFiber;
      return created;
    } else {
      // Move based on index
      const existing = useFiber(current, priority);
      existing.ref = coerceRef(current, element);
      existing.pendingProps = element.props;
      existing.return = returnFiber;
      return existing;
    }
  }

  function updateCoroutine(
    returnFiber : Fiber,
    current : ?Fiber,
    coroutine : ReactCoroutine,
    priority : PriorityLevel
  ) : Fiber {
    // TODO: Should this also compare handler to determine whether to reuse?
    if (current == null || current.tag !== 7) {
      // Insert
      const created = createFiberFromCoroutine(coroutine, priority);
      created.return = returnFiber;
      return created;
    } else {
      // Move based on index
      const existing = useFiber(current, priority);
      existing.pendingProps = coroutine;
      existing.return = returnFiber;
      return existing;
    }
  }

  function updateYield(
    returnFiber : Fiber,
    current : ?Fiber,
    yieldNode : ReactYield,
    priority : PriorityLevel
  ) : Fiber {
    // TODO: Should this also compare continuation to determine whether to reuse?
    if (current == null || current.tag !== 9) {
      // Insert
      const reifiedYield = createReifiedYield(yieldNode);
      const created = createFiberFromYield(yieldNode, priority);
      created.type = reifiedYield;
      created.return = returnFiber;
      return created;
    } else {
      // Move based on index
      const existing = useFiber(current, priority);
      existing.type = createUpdatedReifiedYield(
        current.type,
        yieldNode
      );
      existing.return = returnFiber;
      return existing;
    }
  }

  function updatePortal(
    returnFiber : Fiber,
    current : ?Fiber,
    portal : ReactPortal,
    priority : PriorityLevel
  ) : Fiber {
    if (
      current == null ||
      current.tag !== 4 ||
      current.stateNode.containerInfo !== portal.containerInfo ||
      current.stateNode.implementation !== portal.implementation
    ) {
      // Insert
      const created = createFiberFromPortal(portal, priority);
      created.return = returnFiber;
      return created;
    } else {
      // 2
      const existing = useFiber(current, priority);
      existing.pendingProps = portal.children;
      existing.return = returnFiber;
      return existing;
    }
  }

  function updateFragment(
    returnFiber : Fiber,
    current : ?Fiber,
    fragment : Iterable<*>,
    priority : PriorityLevel
  ) : Fiber {
    if (current == null || current.tag !== 10) {
      // Insert
      const created = createFiberFromFragment(fragment, priority);
      created.return = returnFiber;
      return created;
    } else {
      // 2
      const existing = useFiber(current, priority);
      existing.pendingProps = fragment;
      existing.return = returnFiber;
      return existing;
    }
  }

  function createChild(
    returnFiber : Fiber,
    newChild : any,
    priority : PriorityLevel
  ) : ?Fiber {
    if (typeof newChild === 'string' || typeof newChild === 'number') {
      // Text nodes doesn't have keys. If the previous node is implicitly keyed
      // we can continue to replace it without aborting even if it is not a text
      // node.
      const created = createFiberFromText('' + newChild, priority);
      created.return = returnFiber;
      return created;
    }

    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          const created = createFiberFromElement(newChild, priority);
          created.ref = coerceRef(null, newChild);
          created.return = returnFiber;
          return created;
        }

        case REACT_COROUTINE_TYPE: {
          const created = createFiberFromCoroutine(newChild, priority);
          created.return = returnFiber;
          return created;
        }

        case REACT_YIELD_TYPE: {
          const reifiedYield = createReifiedYield(newChild);
          const created = createFiberFromYield(newChild, priority);
          created.type = reifiedYield;
          created.return = returnFiber;
          return created;
        }

        case REACT_PORTAL_TYPE: {
          const created = createFiberFromPortal(newChild, priority);
          created.return = returnFiber;
          return created;
        }
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        const created = createFiberFromFragment(newChild, priority);
        created.return = returnFiber;
        return created;
      }
    }

    return null;
  }

  function updateSlot(
    returnFiber : Fiber,
    oldFiber : ?Fiber,
    newChild : any,
    priority : PriorityLevel
  ) : ?Fiber {
    // 2 the fiber if the keys match, otherwise return null.

    const key = oldFiber ? oldFiber.key : null;

    if (typeof newChild === 'string' || typeof newChild === 'number') {
      // Text nodes doesn't have keys. If the previous node is implicitly keyed
      // we can continue to replace it without aborting even if it is not a text
      // node.
      if (key !== null) {
        return null;
      }
      return updateTextNode(returnFiber, oldFiber, '' + newChild, priority);
    }

    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          if (newChild.key === key) {
            return updateElement(returnFiber, oldFiber, newChild, priority);
          } else {
            return null;
          }
        }

        case REACT_COROUTINE_TYPE: {
          if (newChild.key === key) {
            return updateCoroutine(returnFiber, oldFiber, newChild, priority);
          } else {
            return null;
          }
        }

        case REACT_YIELD_TYPE: {
          if (newChild.key === key) {
            return updateYield(returnFiber, oldFiber, newChild, priority);
          } else {
            return null;
          }
        }
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        // Fragments doesn't have keys so if the previous key is implicit we can
        // update it.
        if (key !== null) {
          return null;
        }
        return updateFragment(returnFiber, oldFiber, newChild, priority);
      }
    }

    return null;
  }

  function updateFromMap(
    existingChildren : Map<string | number, Fiber>,
    returnFiber : Fiber,
    newIdx : number,
    newChild : any,
    priority : PriorityLevel
  ) : ?Fiber {

    if (typeof newChild === 'string' || typeof newChild === 'number') {
      // Text nodes doesn't have keys, so we neither have to check the old nor
      // new node for the key. If both are text nodes, they match.
      const matchedFiber = existingChildren.get(newIdx) || null;
      return updateTextNode(returnFiber, matchedFiber, '' + newChild, priority);
    }

    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          const matchedFiber = existingChildren.get(
            newChild.key === null ? newIdx : newChild.key
          ) || null;
          return updateElement(returnFiber, matchedFiber, newChild, priority);
        }

        case REACT_COROUTINE_TYPE: {
          const matchedFiber = existingChildren.get(
            newChild.key === null ? newIdx : newChild.key
          ) || null;
          return updateCoroutine(returnFiber, matchedFiber, newChild, priority);
        }

        case REACT_YIELD_TYPE: {
          const matchedFiber = existingChildren.get(
            newChild.key === null ? newIdx : newChild.key
          ) || null;
          return updateYield(returnFiber, matchedFiber, newChild, priority);
        }

        case REACT_PORTAL_TYPE: {
          const matchedFiber = existingChildren.get(
            newChild.key === null ? newIdx : newChild.key
          ) || null;
          return updatePortal(returnFiber, matchedFiber, newChild, priority);
        }
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        const matchedFiber = existingChildren.get(newIdx) || null;
        return updateFragment(returnFiber, matchedFiber, newChild, priority);
      }
    }

    return null;
  }

  function reconcileChildrenArray(
    returnFiber : Fiber,
    currentFirstChild : ?Fiber,
    newChildren : Array<*>,
    priority : PriorityLevel) : ?Fiber {

    // This algorithm can't optimize by searching from boths ends since we
    // don't have backpointers on fibers. I'm trying to see how far we can get
    // with that model. If it ends up not being worth the tradeoffs, we can
    // add it later.

    // Even with a two ended optimization, we'd want to optimize for the case
    // where there are few changes and brute force the comparison instead of
    // going for the Map. It'd like to explore hitting that path first in
    // forward-only mode and only go for the Map once we notice that we need
    // lots of look ahead. This doesn't handle reversal as well as two ended
    // search but that's unusual. Besides, for the two ended optimization to
    // work on Iterables, we'd need to copy the whole set.

    // In this first iteration, we'll just live with hitting the bad case
    // (adding everything to a Map) in for every insert/move.

    // If you change this code, also update reconcileChildrenIterator() which
    // uses the same algorithm.

    let resultingFirstChild : ?Fiber = null;
    let previousNewFiber : ?Fiber = null;

    let oldFiber = currentFirstChild;
    let lastPlacedIndex = 0;
    let newIdx = 0;
    let nextOldFiber = null;
    for (; oldFiber && newIdx < newChildren.length; newIdx++) {
      if (oldFiber) {
        if (oldFiber.index > newIdx) {
          nextOldFiber = oldFiber;
          oldFiber = null;
        } else {
          nextOldFiber = oldFiber.sibling;
        }
      }
      const newFiber = updateSlot(
        returnFiber,
        oldFiber,
        newChildren[newIdx],
        priority
      );
      if (!newFiber) {
        // TODO: This breaks on empty slots like null children. That's
        // unfortunate because it triggers the slow path all the time. We need
        // a better way to communicate whether this was a miss or null,
        // boolean, undefined, etc.
        if (!oldFiber) {
          oldFiber = nextOldFiber;
        }
        break;
      }
      if (shouldTrackSideEffects) {
        if (oldFiber && !newFiber.alternate) {
          // We matched the slot, but we didn't reuse the existing fiber, so we
          // need to delete the existing child.
          deleteChild(returnFiber, oldFiber);
        }
      }
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      if (!previousNewFiber) {
        // TODO: Move out of the loop. This only happens for the first run.
        resultingFirstChild = newFiber;
      } else {
        // TODO: Defer siblings if we're not at the right index for this slot.
        // I.e. if we had null values before, then we want to defer this
        // for each null value. However, we also don't want to call updateSlot
        // with the previous one.
        previousNewFiber.sibling = newFiber;
      }
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }

    if (newIdx === newChildren.length) {
      // We've reached the end of the new children. We can delete the rest.
      deleteRemainingChildren(returnFiber, oldFiber);
      return resultingFirstChild;
    }

    if (!oldFiber) {
      // If we don't have any more existing children we can choose a fast path
      // since the rest will all be insertions.
      for (; newIdx < newChildren.length; newIdx++) {
        const newFiber = createChild(
          returnFiber,
          newChildren[newIdx],
          priority
        );
        if (!newFiber) {
          continue;
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (!previousNewFiber) {
          // TODO: Move out of the loop. This only happens for the first run.
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
      return resultingFirstChild;
    }

    // Add all children to a key map for quick lookups.
    const existingChildren = mapRemainingChildren(returnFiber, oldFiber);

    // Keep scanning and use the map to restore deleted items as moves.
    for (; newIdx < newChildren.length; newIdx++) {
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        newChildren[newIdx],
        priority
      );
      if (newFiber) {
        if (shouldTrackSideEffects) {
          if (newFiber.alternate) {
            // The new fiber is a work in progress, but if there exists a
            // current, that means that we reused the fiber. We need to delete
            // it from the child list so that we don't add it to the deletion
            // list.
            existingChildren.delete(
              newFiber.key === null ? newIdx : newFiber.key
            );
          }
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (!previousNewFiber) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      // Any existing children that weren't consumed above were deleted. We need
      // to add them to the deletion list.
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    return resultingFirstChild;
  }

  function reconcileChildrenIterator(
    returnFiber : Fiber,
    currentFirstChild : ?Fiber,
    newChildren : Iterator<*>,
    priority : PriorityLevel) : ?Fiber {

    // This is the same implementation as reconcileChildrenArray(),
    // but using the iterator instead.

    let resultingFirstChild : ?Fiber = null;
    let previousNewFiber : ?Fiber = null;

    let oldFiber = currentFirstChild;
    let lastPlacedIndex = 0;
    let newIdx = 0;
    let nextOldFiber = null;

    let step = newChildren.next();
    for (; oldFiber && !step.done; newIdx++, step = newChildren.next()) {
      if (oldFiber) {
        if (oldFiber.index > newIdx) {
          nextOldFiber = oldFiber;
          oldFiber = null;
        } else {
          nextOldFiber = oldFiber.sibling;
        }
      }
      const newFiber = updateSlot(
        returnFiber,
        oldFiber,
        step.value,
        priority
      );
      if (!newFiber) {
        // TODO: This breaks on empty slots like null children. That's
        // unfortunate because it triggers the slow path all the time. We need
        // a better way to communicate whether this was a miss or null,
        // boolean, undefined, etc.
        if (!oldFiber) {
          oldFiber = nextOldFiber;
        }
        break;
      }
      if (shouldTrackSideEffects) {
        if (oldFiber && !newFiber.alternate) {
          // We matched the slot, but we didn't reuse the existing fiber, so we
          // need to delete the existing child.
          deleteChild(returnFiber, oldFiber);
        }
      }
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      if (!previousNewFiber) {
        // TODO: Move out of the loop. This only happens for the first run.
        resultingFirstChild = newFiber;
      } else {
        // TODO: Defer siblings if we're not at the right index for this slot.
        // I.e. if we had null values before, then we want to defer this
        // for each null value. However, we also don't want to call updateSlot
        // with the previous one.
        previousNewFiber.sibling = newFiber;
      }
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }

    if (step.done) {
      // We've reached the end of the new children. We can delete the rest.
      deleteRemainingChildren(returnFiber, oldFiber);
      return resultingFirstChild;
    }

    if (!oldFiber) {
      // If we don't have any more existing children we can choose a fast path
      // since the rest will all be insertions.
      for (; !step.done; newIdx++, step = newChildren.next()) {
        const newFiber = createChild(
          returnFiber,
          step.value,
          priority
        );
        if (!newFiber) {
          continue;
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (!previousNewFiber) {
          // TODO: Move out of the loop. This only happens for the first run.
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
      return resultingFirstChild;
    }

    // Add all children to a key map for quick lookups.
    const existingChildren = mapRemainingChildren(returnFiber, oldFiber);

    // Keep scanning and use the map to restore deleted items as moves.
    for (; !step.done; newIdx++, step = newChildren.next()) {
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        step.value,
        priority
      );
      if (newFiber) {
        if (shouldTrackSideEffects) {
          if (newFiber.alternate) {
            // The new fiber is a work in progress, but if there exists a
            // current, that means that we reused the fiber. We need to delete
            // it from the child list so that we don't add it to the deletion
            // list.
            existingChildren.delete(
              newFiber.key === null ? newIdx : newFiber.key
            );
          }
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (!previousNewFiber) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      // Any existing children that weren't consumed above were deleted. We need
      // to add them to the deletion list.
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    return resultingFirstChild;
  }

  function reconcileSingleTextNode(
    returnFiber : Fiber,
    currentFirstChild : ?Fiber,
    textContent : string,
    priority : PriorityLevel
  ) : Fiber {
    // There's no need to check for keys on text nodes since we don't have a
    // way to define them.
    if (currentFirstChild && currentFirstChild.tag === 6) {
      // We already have an existing node so let's just update it and delete
      // the rest.
      deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
      const existing = useFiber(currentFirstChild, priority);
      existing.pendingProps = textContent;
      existing.return = returnFiber;
      return existing;
    }
    // The existing first child is not a text node so we need to create one
    // and delete the existing ones.
    deleteRemainingChildren(returnFiber, currentFirstChild);
    const created = createFiberFromText(textContent, priority);
    created.return = returnFiber;
    return created;
  }

  function reconcileSingleElement(
    returnFiber : Fiber,
    currentFirstChild : ?Fiber,
    element : ReactElement<any>,
    priority : PriorityLevel
  ) : Fiber {
    const key = element.key;
    let child = currentFirstChild;
    while (child) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      if (child.key === key) {
        if (child.type === element.type) {
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, priority);
          existing.ref = coerceRef(child, element);
          existing.pendingProps = element.props;
          existing.return = returnFiber;
          return existing;
        } else {
          deleteRemainingChildren(returnFiber, child);
          break;
        }
      } else {
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }

    const created = createFiberFromElement(element, priority);
    created.ref = coerceRef(currentFirstChild, element);
    created.return = returnFiber;
    return created;
  }

  function reconcileSingleCoroutine(
    returnFiber : Fiber,
    currentFirstChild : ?Fiber,
    coroutine : ReactCoroutine,
    priority : PriorityLevel
  ) : Fiber {
    const key = coroutine.key;
    let child = currentFirstChild;
    while (child) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      if (child.key === key) {
        if (child.tag === 7) {
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, priority);
          existing.pendingProps = coroutine;
          existing.return = returnFiber;
          return existing;
        } else {
          deleteRemainingChildren(returnFiber, child);
          break;
        }
      } else {
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }

    const created = createFiberFromCoroutine(coroutine, priority);
    created.return = returnFiber;
    return created;
  }

  function reconcileSingleYield(
    returnFiber : Fiber,
    currentFirstChild : ?Fiber,
    yieldNode : ReactYield,
    priority : PriorityLevel
  ) : Fiber {
    const key = yieldNode.key;
    let child = currentFirstChild;
    while (child) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      if (child.key === key) {
        if (child.tag === 9) {
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, priority);
          existing.type = createUpdatedReifiedYield(
            child.type,
            yieldNode
          );
          existing.return = returnFiber;
          return existing;
        } else {
          deleteRemainingChildren(returnFiber, child);
          break;
        }
      } else {
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }

    const reifiedYield = createReifiedYield(yieldNode);
    const created = createFiberFromYield(yieldNode, priority);
    created.type = reifiedYield;
    created.return = returnFiber;
    return created;
  }

  function reconcileSinglePortal(
    returnFiber : Fiber,
    currentFirstChild : ?Fiber,
    portal : ReactPortal,
    priority : PriorityLevel
  ) : Fiber {
    const key = portal.key;
    let child = currentFirstChild;
    while (child) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      if (child.key === key) {
        if (
          child.tag === 4 &&
          child.stateNode.containerInfo === portal.containerInfo &&
          child.stateNode.implementation === portal.implementation
        ) {
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, priority);
          existing.pendingProps = portal.children;
          existing.return = returnFiber;
          return existing;
        } else {
          deleteRemainingChildren(returnFiber, child);
          break;
        }
      } else {
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }

    const created = createFiberFromPortal(portal, priority);
    created.return = returnFiber;
    return created;
  }

  // This API will tag the children with the side-effect of the reconciliation
  // itself. They will be added to the side-effect list as we pass through the
  // children and the parent.
  function reconcileChildFibers(
    returnFiber : Fiber,
    currentFirstChild : ?Fiber,
    newChild : any,
    priority : PriorityLevel
  ) : ?Fiber {
    // This function is not recursive.
    // If the top level item is an array, we treat it as a set of children,
    // not as a fragment. Nested arrays on the other hand will be treated as
    // fragment nodes. Recursion happens at the normal flow.

    if (typeof newChild === 'string' || typeof newChild === 'number') {
      return placeSingleChild(reconcileSingleTextNode(
        returnFiber,
        currentFirstChild,
        '' + newChild,
        priority
      ));
    }

    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return placeSingleChild(reconcileSingleElement(
            returnFiber,
            currentFirstChild,
            newChild,
            priority
          ));

        case REACT_COROUTINE_TYPE:
          return placeSingleChild(reconcileSingleCoroutine(
            returnFiber,
            currentFirstChild,
            newChild,
            priority
          ));

        case REACT_YIELD_TYPE:
          return placeSingleChild(reconcileSingleYield(
            returnFiber,
            currentFirstChild,
            newChild,
            priority
          ));

        case REACT_PORTAL_TYPE:
          return placeSingleChild(reconcileSinglePortal(
            returnFiber,
            currentFirstChild,
            newChild,
            priority
          ));
      }

      if (isArray(newChild)) {
        return reconcileChildrenArray(
          returnFiber,
          currentFirstChild,
          newChild,
          priority
        );
      }

      const iteratorFn = getIteratorFn(newChild);
      if (iteratorFn) {
        const iterator = iteratorFn.call(newChild);
        if (iterator == null) {
          throw new Error('An iterable object provided no iterator.');
        }
        return reconcileChildrenIterator(
          returnFiber,
          currentFirstChild,
          iterator,
          priority
        );
      }
    }

    // Remaining cases are all treated as empty.
    return deleteRemainingChildren(returnFiber, currentFirstChild);
  }

  return reconcileChildFibers;
}

var reconcileChildFibers = ChildReconciler(true, true);

var reconcileChildFibersInPlace = ChildReconciler(false, true);

var mountChildFibersInPlace = ChildReconciler(false, false);

function cloneChildFibers(current : ?Fiber, workInProgress : Fiber) : void {
  if (!workInProgress.child) {
    return;
  }
  if (current && workInProgress.child === current.child) {
    // We use workInProgress.child since that lets Flow know that it can't be
    // null since we validated that already. However, as the line above suggests
    // they're actually the same thing.
    let currentChild = workInProgress.child;
    // TODO: This used to reset the pending priority. Not sure if that is needed.
    // workInProgress.pendingWorkPriority = current.pendingWorkPriority;
    // TODO: The below priority used to be set to 0 which would've
    // dropped work. This is currently unobservable but will become
    // observable when the first sibling has lower priority work remaining
    // than the next sibling. At that point we should add tests that catches
    // this.
    let newChild = cloneFiber(currentChild, currentChild.pendingWorkPriority);
    workInProgress.child = newChild;

    newChild.return = workInProgress;
    while (currentChild.sibling) {
      currentChild = currentChild.sibling;
      newChild = newChild.sibling = cloneFiber(
        currentChild,
        currentChild.pendingWorkPriority
      );
      newChild.return = workInProgress;
    }
    newChild.sibling = null;
  }

  // If there is no alternate, then we don't need to clone the children.
  // If the children of the alternate fiber is a different set, then we don't
  // need to clone. We need to reset the return fiber though since we'll
  // traverse down into them.
  let child = workInProgress.child;
  while (child) {
    child.return = workInProgress;
    child = child.sibling;
  }
}






if (__DEV__) {
  var checkReactTypeSpec = require('checkReactTypeSpec');
}

// Context
let index = -1;
const contextStack : Array<Object> = [];
const didPerformWorkStack : Array<boolean> = [];

function getUnmaskedContext() {
  if (index === -1) {
    return emptyObject;
  }
  return contextStack[index];
}

function getMaskedContext(fiber : Fiber) {
  const type = fiber.type;
  const contextTypes = type.contextTypes;
  if (!contextTypes) {
    return emptyObject;
  }

  const unmaskedContext = getUnmaskedContext();
  const context = {};
  for (let key in contextTypes) {
    context[key] = unmaskedContext[key];
  }

  if (__DEV__) {
    const name = getComponentName(fiber);
    const debugID = 0; // TODO: pass a real ID
    checkReactTypeSpec(contextTypes, context, 'context', name, null, debugID);
  }

  return context;
};

function hasContextChanged() : boolean {
  return index > -1 && didPerformWorkStack[index];
};

function isContextProvider(fiber : Fiber) : boolean {
  return (
    fiber.tag === 2 &&
    // Instance might be null, if the fiber errored during construction
    fiber.stateNode &&
    typeof fiber.stateNode.getChildContext === 'function'
  );
}

function popContextProvider() : void {
  contextStack[index] = emptyObject;
  didPerformWorkStack[index] = false;
  index--;
}

function pushTopLevelContextObject(context : Object, didChange : boolean) : void {
  invariant(index === -1, 'Unexpected context found on stack');
  index++;
  contextStack[index] = context;
  didPerformWorkStack[index] = didChange;
};

function processChildContext(fiber : Fiber, parentContext : Object): Object {
  const instance = fiber.stateNode;
  const childContextTypes = fiber.type.childContextTypes;
  const childContext = instance.getChildContext();
  for (let contextKey in childContext) {
    invariant(
      contextKey in childContextTypes,
      '%s.getChildContext(): key "%s" is not defined in childContextTypes.',
      getComponentName(fiber),
      contextKey
    );
  }
  if (__DEV__) {
    const name = getComponentName(fiber);
    const debugID = 0; // TODO: pass a real ID
    checkReactTypeSpec(childContextTypes, childContext, 'childContext', name, null, debugID);
  }
  return {...parentContext, ...childContext};
}

function pushContextProvider(fiber : Fiber, didPerformWork : boolean) : void {
  const instance = fiber.stateNode;
  const memoizedMergedChildContext = instance.__reactInternalMemoizedMergedChildContext;
  const canReuseMergedChildContext = !didPerformWork && memoizedMergedChildContext != null;

  let mergedContext = null;
  if (canReuseMergedChildContext) {
    mergedContext = memoizedMergedChildContext;
  } else {
    mergedContext = processChildContext(fiber, getUnmaskedContext());
    instance.__reactInternalMemoizedMergedChildContext = mergedContext;
  }

  index++;
  contextStack[index] = mergedContext;
  didPerformWorkStack[index] = didPerformWork;
};

function resetContext() : void {
  index = -1;
};

function findCurrentUnmaskedContext(fiber: Fiber) : Object {
  // Currently this is only used with renderSubtreeIntoContainer; not sure if it
  // makes sense elsewhere
  invariant(
    isFiberMounted(fiber) && fiber.tag === 2,
    'Expected subtree parent to be a mounted class component'
  );

  let node : Fiber = fiber;
  while (node.tag !== 3) {
    if (isContextProvider(node)) {
      return node.stateNode.__reactInternalMemoizedMergedChildContext;
    }
    const parent = node.return;
    invariant(parent, 'Found unexpected detached subtree parent');
    node = parent;
  }
  return node.stateNode.context;
};

function unwindContext(from : Fiber, to: Fiber) {
  let node = from;
  while (node && (node !== to) && (node.alternate !== to)) {
    if (isContextProvider(node)) {
      popContextProvider();
    }
    node = node.return;
  }
}

// UpdateQ

function createUpdateQueue(partialState : mixed) : UpdateQueue {
  const queue = {
    partialState,
    callback: null,
    isReplace: false,
    next: null,
    isForced: false,
    hasUpdate: partialState != null,
    hasCallback: false,
    tail: (null : any),
  };
  queue.tail = queue;
  return queue;
};

function addToQueue(queue : UpdateQueue, partialState : mixed) : UpdateQueue {
  const node = {
    partialState,
    callback: null,
    isReplace: false,
    next: null,
  };
  queue.tail.next = node;
  queue.tail = node;
  queue.hasUpdate = queue.hasUpdate || (partialState != null);
  return queue;
}


function addCallbackToQueue(queue : UpdateQueue, callback: Function) : UpdateQueue {
  if (queue.tail.callback) {
    // If the tail already as a callback, add an empty node to queue
    addToQueue(queue, null);
  }
  queue.tail.callback = callback;
  queue.hasCallback = true;
  return queue;
};

function callCallbacks(queue : UpdateQueue, context : any) {
  let node : ?UpdateQueueNode = queue;
  while (node) {
    const callback = node.callback;
    if (callback) {
      if (typeof context !== 'undefined') {
        callback.call(context);
      } else {
        callback();
      }
    }
    node = node.next;
  }
};

function getStateFromNode(node, instance, state, props) {
  if (typeof node.partialState === 'function') {
    const updateFn = node.partialState;
    return updateFn.call(instance, state, props);
  } else {
    return node.partialState;
  }
}

function mergeUpdateQueue(queue : UpdateQueue, instance : any, prevState : any, props : any) : any {
  let node : ?UpdateQueueNode = queue;
  if (queue.isReplace) {
    // replaceState is always first in the queue.
    prevState = getStateFromNode(queue, instance, prevState, props);
    node = queue.next;
    if (!node) {
      // If there is no more work, we replace the raw object instead of cloning.
      return prevState;
    }
  }
  let state = Object.assign({}, prevState);
  while (node) {
    let partialState = getStateFromNode(node, instance, state, props);
    Object.assign(state, partialState);
    node = node.next;
  }
  return state;
};


var ReactInstanceMap = require('ReactInstanceMap');

var invariant = require('invariant');

// FiberTreeReflection

function isFiberMountedImpl(fiber : Fiber) : number {
  let node = fiber;
  if (!fiber.alternate) {
    // If there is no alternate, this might be a new tree that isn't inserted
    // yet. If it is, then it will have a pending insertion effect on it.
    if ((node.effectTag & 1) !== 0) {
      return 1;
    }
    while (node.return) {
      node = node.return;
      if ((node.effectTag & 1) !== 0) {
        return 1;
      }
    }
  } else {
    while (node.return) {
      node = node.return;
    }
  }
  if (node.tag === 3) {
    // TODO: Check if this was a nested 3 when used with
    // renderContainerIntoSubtree.
    return 2;
  }
  // If we didn't hit the root, that means that we're in an disconnected tree
  // that has been unmounted.
  return 3;
}
function isFiberMounted(fiber : Fiber) : boolean {
  return isFiberMountedImpl(fiber) === 2;
};

function isMounted(component : ReactComponent<any, any, any>) : boolean {
  var fiber : ?Fiber = ReactInstanceMap.get(component);
  if (!fiber) {
    return false;
  }
  return isFiberMountedImpl(fiber) === 2;
};

function assertIsMounted(fiber) {
  invariant(
    isFiberMountedImpl(fiber) === 2,
    'Unable to find node on an unmounted component.'
  );
}

function findCurrentFiberUsingSlowPath(fiber : Fiber) : Fiber | null {
  let alternate = fiber.alternate;
  if (!alternate) {
    // If there is no alternate, then we only need to check if it is mounted.
    const state = isFiberMountedImpl(fiber);
    invariant(
      state !== 3,
      'Unable to find node on an unmounted component.'
    );
    if (state === 1) {
      return null;
    }
    return fiber;
  }
  // If we have two possible branches, we'll walk backwards up to the root
  // to see what path the root points to. On the way we may hit one of the
  // special cases and we'll deal with them.
  let a = fiber;
  let b = alternate;
  while (true) {
    let parentA = a.return;
    let parentB = b.return;
    if (!parentA || !parentB) {
      // We're at the root.
      break;
    }
    if (parentA.child === parentB.child) {
      // If both parents are the same, then that is the current parent. If
      // they're different but point to the same child, then it doesn't matter.
      // Regardless, whatever child they point to is the current child.
      // So we can now determine which child is current by scanning the child
      // list for either A or B.
      let child = parentA.child;
      while (child) {
        if (child === a) {
          // We've determined that A is the current branch.
          assertIsMounted(parentA);
          return fiber;
        }
        if (child === b) {
          // We've determined that B is the current branch.
          assertIsMounted(parentA);
          return alternate;
        }
        child = child.sibling;
      }
      // We should never have an alternate for any mounting node. So the only
      // way this could possibly happen is if this was unmounted, if at all.
      invariant(
        false,
        'Unable to find node on an unmounted component.'
      );
    }
    a = parentA;
    b = parentB;
    invariant(
      a.alternate === b,
      'Return fibers should always be each others\' alternates.'
    );
  }
  // If the root is not a host container, we're in a disconnected tree. I.e.
  // unmounted.
  invariant(
    a.tag === 3,
    'Unable to find node on an unmounted component.'
  );
  if (a.stateNode.current === a) {
    // We've determined that A is the current branch.
    return fiber;
  }
  // Otherwise B has to be current branch.
  return alternate;
}

function findCurrentHostFiber(parent : Fiber) : Fiber | null {
  const currentParent = findCurrentFiberUsingSlowPath(parent);
  if (!currentParent) {
    return null;
  }

  // Next we'll drill down this component to find the first 5/Text.
  let node : Fiber = currentParent;
  while (true) {
    if (node.tag === 5 || node.tag === 6) {
      return node;
    } else if (node.child) {
      // TODO: If we hit a Portal, we're supposed to skip it.
      // TODO: Coroutines need to visit the stateNode.
      node.child.return = node;
      node = node.child;
      continue;
    }
    if (node === currentParent) {
      return null;
    }
    while (!node.sibling) {
      if (!node.return || node.return === currentParent) {
        return null;
      }
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
  // Flow needs the return null here, but ESLint complains about it.
  // eslint-disable-next-line no-unreachable
  return null;
};

function getComponentName(fiber: Fiber): string {
  const type = fiber.type;
  const instance = fiber.stateNode;
  const constructor = instance && instance.constructor;
  return (
    type.displayName || (constructor && constructor.displayName) ||
    type.name || (constructor && constructor.name) ||
    'A Component'
  );
};


var ReactInstanceMap = require('ReactInstanceMap');
var shallowEqual = require('shallowEqual');
var warning = require('warning');
var invariant = require('invariant');


  // 2 

  function scheduleUpdateQueue(fiber: Fiber, updateQueue: UpdateQueue) {
    fiber.updateQueue = updateQueue;
    // Schedule update on the alternate as well, since we don't know which tree
    // is current.
    if (fiber.alternate) {
      fiber.alternate.updateQueue = updateQueue;
    }
    scheduleUpdate(fiber);
  }

  // Class component state updater
  const updater = {
    isMounted,
    enqueueSetState(instance, partialState) {
      const fiber = ReactInstanceMap.get(instance);
      const updateQueue = fiber.updateQueue ?
        addToQueue(fiber.updateQueue, partialState) :
        createUpdateQueue(partialState);
      scheduleUpdateQueue(fiber, updateQueue);
    },
    enqueueReplaceState(instance, state) {
      const fiber = ReactInstanceMap.get(instance);
      const updateQueue = createUpdateQueue(state);
      updateQueue.isReplace = true;
      scheduleUpdateQueue(fiber, updateQueue);
    },
    enqueueForceUpdate(instance) {
      const fiber = ReactInstanceMap.get(instance);
      const updateQueue = fiber.updateQueue || createUpdateQueue(null);
      updateQueue.isForced = true;
      scheduleUpdateQueue(fiber, updateQueue);
    },
    enqueueCallback(instance, callback) {
      const fiber = ReactInstanceMap.get(instance);
      let updateQueue = fiber.updateQueue ?
        fiber.updateQueue :
        createUpdateQueue(null);
      addCallbackToQueue(updateQueue, callback);
      scheduleUpdateQueue(fiber, updateQueue);
    },
  };

  function checkShouldComponentUpdate(workInProgress, oldProps, newProps, newState, newContext) {
    const updateQueue = workInProgress.updateQueue;
    if (oldProps === null || (updateQueue && updateQueue.isForced)) {
      return true;
    }

    const instance = workInProgress.stateNode;
    if (typeof instance.shouldComponentUpdate === 'function') {
      const shouldUpdate = instance.shouldComponentUpdate(newProps, newState, newContext);

      if (__DEV__) {
        warning(
          shouldUpdate !== undefined,
          '%s.shouldComponentUpdate(): Returned undefined instead of a ' +
          'boolean value. Make sure to return true or false.',
          getComponentName(workInProgress)
        );
      }

      return shouldUpdate;
    }

    const type = workInProgress.type;
    if (type.prototype && type.prototype.isPureReactComponent) {
      return (
        !shallowEqual(oldProps, newProps) ||
        !shallowEqual(instance.state, newState)
      );
    }

    return true;
  }

  function checkClassInstance(workInProgress: Fiber) {
    const instance = workInProgress.stateNode;
    if (__DEV__) {
      const name = getComponentName(workInProgress);
      const renderPresent = instance.render;
      warning(
        renderPresent,
        '%s(...): No `render` method found on the returned component ' +
        'instance: you may have forgotten to define `render`.',
        name
      );
      const noGetInitialStateOnES6 = (
        !instance.getInitialState ||
        instance.getInitialState.isReactClassApproved
      );
      warning(
        noGetInitialStateOnES6,
        'getInitialState was defined on %s, a plain JavaScript class. ' +
        'This is only supported for classes created using React.createClass. ' +
        'Did you mean to define a state property instead?',
        name
      );
      const noGetDefaultPropsOnES6 = (
        !instance.getDefaultProps ||
        instance.getDefaultProps.isReactClassApproved
      );
      warning(
        noGetDefaultPropsOnES6,
        'getDefaultProps was defined on %s, a plain JavaScript class. ' +
        'This is only supported for classes created using React.createClass. ' +
        'Use a static property to define defaultProps instead.',
        name
      );
      const noInstancePropTypes = !instance.propTypes;
      warning(
        noInstancePropTypes,
        'propTypes was defined as an instance property on %s. Use a static ' +
        'property to define propTypes instead.',
        name,
      );
      const noInstanceContextTypes = !instance.contextTypes;
      warning(
        noInstanceContextTypes,
        'contextTypes was defined as an instance property on %s. Use a static ' +
        'property to define contextTypes instead.',
        name,
      );
      const noComponentShouldUpdate = typeof instance.componentShouldUpdate !== 'function';
      warning(
        noComponentShouldUpdate,
        '%s has a method called ' +
        'componentShouldUpdate(). Did you mean shouldComponentUpdate()? ' +
        'The name is phrased as a question because the function is ' +
        'expected to return a value.',
        name
      );
      const noComponentDidUnmount = typeof instance.componentDidUnmount !== 'function';
      warning(
        noComponentDidUnmount,
        '%s has a method called ' +
        'componentDidUnmount(). But there is no such lifecycle method. ' +
        'Did you mean componentWillUnmount()?',
        name
      );
      const noComponentWillRecieveProps = typeof instance.componentWillRecieveProps !== 'function';
      warning(
        noComponentWillRecieveProps,
        '%s has a method called ' +
        'componentWillRecieveProps(). Did you mean componentWillReceiveProps()?',
        name
      );
    }

    const state = instance.state;
    if (state && (typeof state !== 'object' || isArray(state))) {
      invariant(
        false,
        '%s.state: must be set to an object or null',
        getComponentName(workInProgress)
      );
    }
    if (typeof instance.getChildContext === 'function') {
      invariant(
        typeof workInProgress.type.childContextTypes === 'object',
        '%s.getChildContext(): childContextTypes must be defined in order to ' +
        'use getChildContext().',
        getComponentName(workInProgress)
      );
    }
  }

  function adoptClassInstance(workInProgress : Fiber, instance : any) : void {
    instance.updater = updater;
    workInProgress.stateNode = instance;
    // The instance needs access to the fiber so that it can schedule updates
    ReactInstanceMap.set(instance, workInProgress);
  }

  function constructClassInstance(workInProgress : Fiber) : any {
    const ctor = workInProgress.type;
    const props = workInProgress.pendingProps;
    const context = getMaskedContext(workInProgress);
    const instance = new ctor(props, context);
    adoptClassInstance(workInProgress, instance);
    checkClassInstance(workInProgress);
    return instance;
  }

  // Invokes the mount life-cycles on a previously never rendered instance.
  function mountClassInstance(workInProgress : Fiber) : void {
    const instance = workInProgress.stateNode;
    const state = instance.state || null;

    let props = workInProgress.pendingProps;
    if (!props) {
      throw new Error('There must be pending props for an initial mount.');
    }

    instance.props = props;
    instance.state = state;
    instance.context = getMaskedContext(workInProgress);

    if (typeof instance.componentWillMount === 'function') {
      instance.componentWillMount();
      // If we had additional state updates during this life-cycle, let's
      // process them now.
      const updateQueue = workInProgress.updateQueue;
      if (updateQueue) {
        instance.state = mergeUpdateQueue(updateQueue, instance, state, props);
      }
    }
  }

  // Called on a preexisting class instance. Returns false if a resumed render
  // could be reused.
  function resumeMountClassInstance(workInProgress : Fiber) : boolean {
    let newState = workInProgress.memoizedState;
    let newProps = workInProgress.pendingProps;
    if (!newProps) {
      // If there isn't any new props, then we'll reuse the memoized props.
      // This could be from already completed work.
      newProps = workInProgress.memoizedProps;
      if (!newProps) {
        throw new Error('There should always be pending or memoized props.');
      }
    }
    const newContext = getMaskedContext(workInProgress);

    // TODO: Should we deal with a setState that happened after the last
    // componentWillMount and before this componentWillMount? Probably
    // unsupported anyway.

    if (!checkShouldComponentUpdate(
      workInProgress,
      workInProgress.memoizedProps,
      newProps,
      newState,
      newContext
    )) {
      return false;
    }

    // If we didn't bail out we need to construct a new instance. We don't
    // want to reuse one that failed to fully mount.
    const newInstance = constructClassInstance(workInProgress);
    newInstance.props = newProps;
    newInstance.state = newState = newInstance.state || null;
    newInstance.context = getMaskedContext(workInProgress);

    if (typeof newInstance.componentWillMount === 'function') {
      newInstance.componentWillMount();
    }
    // If we had additional state updates, process them now.
    // They may be from componentWillMount() or from error boundary's setState()
    // during initial mounting.
    const newUpdateQueue = workInProgress.updateQueue;
    if (newUpdateQueue) {
      newInstance.state = mergeUpdateQueue(newUpdateQueue, newInstance, newState, newProps);
    }
    return true;
  }

  // Invokes the update life-cycles and returns false if it shouldn't rerender.
  function updateClassInstance(current : Fiber, workInProgress : Fiber) : boolean {
    const instance = workInProgress.stateNode;

    const oldProps = workInProgress.memoizedProps || current.memoizedProps;
    let newProps = workInProgress.pendingProps;
    if (!newProps) {
      // If there aren't any new props, then we'll reuse the memoized props.
      // This could be from already completed work.
      newProps = oldProps;
      if (!newProps) {
        throw new Error('There should always be pending or memoized props.');
      }
    }
    const oldContext = instance.context;
    const newContext = getMaskedContext(workInProgress);

    // Note: During these life-cycles, instance.props/instance.state are what
    // ever the previously attempted to render - not the "current". However,
    // during componentDidUpdate we pass the "current" props.

    if (oldProps !== newProps || oldContext !== newContext) {
      if (typeof instance.componentWillReceiveProps === 'function') {
        instance.componentWillReceiveProps(newProps, newContext);
      }
    }

    // Compute the next state using the memoized state and the update queue.
    const updateQueue = workInProgress.updateQueue;
    const oldState = workInProgress.memoizedState;
    // TODO: Previous state can be null.
    let newState;
    if (updateQueue) {
      if (!updateQueue.hasUpdate) {
        newState = oldState;
      } else {
        newState = mergeUpdateQueue(updateQueue, instance, oldState, newProps);
      }
    } else {
      newState = oldState;
    }

    if (oldProps === newProps &&
        oldState === newState &&
        oldContext === newContext &&
        updateQueue && !updateQueue.isForced) {
      return false;
    }

    if (!checkShouldComponentUpdate(
      workInProgress,
      oldProps,
      newProps,
      newState,
      newContext
    )) {
      // TODO: Should this get the new props/state updated regardless?
      return false;
    }

    if (typeof instance.componentWillUpdate === 'function') {
      instance.componentWillUpdate(newProps, newState, newContext);
    }

    instance.props = newProps;
    instance.state = newState;
    instance.context = newContext;
    return true;
  }

// BeginWork

  // BeginWork

  function markChildAsProgressed(current, workInProgress, priorityLevel) {
    // We now have clones. Let's store them as the currently progressed work.
    workInProgress.progressedChild = workInProgress.child;
    workInProgress.progressedPriority = priorityLevel;
    if (current) {
      // We also store it on the current. When the alternate swaps in we can
      // continue from this point.
      current.progressedChild = workInProgress.progressedChild;
      current.progressedPriority = workInProgress.progressedPriority;
    }
  }

  function clearDeletions(workInProgress) {
    workInProgress.progressedFirstDeletion =
      workInProgress.progressedLastDeletion =
        null;
  }

  function transferDeletions(workInProgress) {
    // Any deletions get added first into the effect list.
    workInProgress.firstEffect = workInProgress.progressedFirstDeletion;
    workInProgress.lastEffect = workInProgress.progressedLastDeletion;
  }

  function reconcileChildren(current, workInProgress, nextChildren) {
    const priorityLevel = workInProgress.pendingWorkPriority;
    reconcileChildrenAtPriority(current, workInProgress, nextChildren, priorityLevel);
  }

  function reconcileChildrenAtPriority(current, workInProgress, nextChildren, priorityLevel) {
    // At this point any memoization is no longer valid since we'll have changed
    // the children.
    workInProgress.memoizedProps = null;
    if (!current) {
      // If this is a fresh new component that hasn't been rendered yet, we
      // won't update its child set by applying minimal side-effects. Instead,
      // we will add them all to the child before it gets rendered. That means
      // we can optimize this reconciliation pass by not tracking side-effects.
      workInProgress.child = mountChildFibersInPlace(
        workInProgress,
        workInProgress.child,
        nextChildren,
        priorityLevel
      );
    } else if (current.child === workInProgress.child) {
      // If the current child is the same as the work in progress, it means that
      // we haven't yet started any work on these children. Therefore, we use
      // the clone algorithm to create a copy of all the current children.

      // If we had any progressed work already, that is invalid at this point so
      // let's throw it out.
      clearDeletions(workInProgress);

      workInProgress.child = reconcileChildFibers(
        workInProgress,
        workInProgress.child,
        nextChildren,
        priorityLevel
      );

      transferDeletions(workInProgress);
    } else {
      // If, on the other hand, it is already using a clone, that means we've
      // already begun some work on this tree and we can continue where we left
      // off by reconciling against the existing children.
      workInProgress.child = reconcileChildFibersInPlace(
        workInProgress,
        workInProgress.child,
        nextChildren,
        priorityLevel
      );

      transferDeletions(workInProgress);
    }
    markChildAsProgressed(current, workInProgress, priorityLevel);
  }

  function updateFragment(current, workInProgress) {
    var nextChildren = workInProgress.pendingProps;
    reconcileChildren(current, workInProgress, nextChildren);
  }

  function updateFunctionalComponent(current, workInProgress) {
    var fn = workInProgress.type;
    var props = workInProgress.pendingProps;
    var context = getMaskedContext(workInProgress);

    // TODO: Disable this before release, since it is not part of the public API
    // I use this for testing to compare the relative overhead of classes.
    if (typeof fn.shouldComponentUpdate === 'function') {
      if (workInProgress.memoizedProps !== null) {
        if (!fn.shouldComponentUpdate(workInProgress.memoizedProps, props)) {
          return bailoutOnAlreadyFinishedWork(current, workInProgress);
        }
      }
    }

    var nextChildren;

    if (__DEV__) {
      ReactCurrentOwner.current = workInProgress;
      nextChildren = fn(props, context);
    } else {
      nextChildren = fn(props, context);
    }
    reconcileChildren(current, workInProgress, nextChildren);
    return workInProgress.child;
  }

  function updateClassComponent(current : ?Fiber, workInProgress : Fiber) {
    let shouldUpdate;
    if (!current) {
      if (!workInProgress.stateNode) {
        // In the initial pass we might need to construct the instance.
        constructClassInstance(workInProgress);
        mountClassInstance(workInProgress);
        shouldUpdate = true;
      } else {
        // In a resume, we'll already have an instance we can reuse.
        shouldUpdate = resumeMountClassInstance(workInProgress);
      }
    } else {
      shouldUpdate = updateClassInstance(current, workInProgress);
    }
    if (!shouldUpdate) {
      return bailoutOnAlreadyFinishedWork(current, workInProgress);
    }
    // Rerender
    const instance = workInProgress.stateNode;
    ReactCurrentOwner.current = workInProgress;
    const nextChildren = instance.render();
    reconcileChildren(current, workInProgress, nextChildren);
    // Put context on the stack because we will work on children
    if (isContextProvider(workInProgress)) {
      pushContextProvider(workInProgress, true);
    }
    return workInProgress.child;
  }

  function updateHostComponent(current, workInProgress) {
    const nextProps = workInProgress.pendingProps;
    const prevProps = current ? current.memoizedProps : null;
    let nextChildren = nextProps.children;
    const isDirectTextChild = shouldSetTextContent(nextProps);

    if (isDirectTextChild) {
      // We special case a direct text child of a host node. This is a common
      // case. We won't handle it as a reified child. We will instead handle
      // this in the host environment that also have access to this prop. That
      // avoids allocating another 6 fiber and traversing it.
      nextChildren = null;
    } else if (
      prevProps &&
      shouldSetTextContent(prevProps)
    ) {
      // If we're switching from a direct text child to a normal child, or to
      // empty, we need to schedule the text content to be reset.
      workInProgress.effectTag |= 8;
    }
    if (nextProps.hidden &&
        workInProgress.pendingWorkPriority !== 6) {
      // If this host component is hidden, we can bail out on the children.
      // We'll rerender the children later at the lower priority.

      // It is unfortunate that we have to do the reconciliation of these
      // children already since that will add them to the tree even though
      // they are not actually done yet. If this is a large set it is also
      // confusing that this takes time to do right now instead of later.

      if (workInProgress.progressedPriority === 6) {
        // If we already made some progress on the offscreen priority before,
        // then we should continue from where we left off.
        workInProgress.child = workInProgress.progressedChild;
      }

      // Reconcile the children and stash them for later work.
      reconcileChildrenAtPriority(current, workInProgress, nextChildren, 6);
      workInProgress.child = current ? current.child : null;

      if (!current) {
        // If this doesn't have a current we won't track it for placement
        // effects. However, when we come back around to this we have already
        // inserted the parent which means that we'll infact need to make this a
        // placement.
        // TODO: There has to be a better solution to this problem.
        let child = workInProgress.progressedChild;
        while (child) {
          child.effectTag = 1;
          child = child.sibling;
        }
      }

      // Abort and don't process children yet.
      return null;
    } else {
      pushHostContext(workInProgress);
      reconcileChildren(current, workInProgress, nextChildren);
      return workInProgress.child;
    }
  }

  function mountIndeterminateComponent(current, workInProgress) {
    if (current) {
      throw new Error('An indeterminate component should never have mounted.');
    }
    var fn = workInProgress.type;
    var props = workInProgress.pendingProps;
    var context = getMaskedContext(workInProgress);

    var value;

    if (__DEV__) {
      ReactCurrentOwner.current = workInProgress;
      value = fn(props, context);
    } else {
      value = fn(props, context);
    }

    if (typeof value === 'object' && value && typeof value.render === 'function') {
      // Proceed under the assumption that this is a class instance
      workInProgress.tag = 2;
      adoptClassInstance(workInProgress, value);
      mountClassInstance(workInProgress);
      ReactCurrentOwner.current = workInProgress;
      value = value.render();
    } else {
      // Proceed under the assumption that this is a functional component
      workInProgress.tag = 1;
    }
    reconcileChildren(current, workInProgress, value);
    return workInProgress.child;
  }

  function updateCoroutineComponent(current, workInProgress) {
    var coroutine = (workInProgress.pendingProps : ?ReactCoroutine);
    if (!coroutine) {
      throw new Error('Should be resolved by now');
    }
    reconcileChildren(current, workInProgress, coroutine.children);
  }

  function updatePortalComponent(current, workInProgress) {
    const priorityLevel = workInProgress.pendingWorkPriority;
    const nextChildren = workInProgress.pendingProps;
    if (!current) {
      // Portals are special because we don't append the children during mount
      // but at commit. Therefore we need to track insertions which the normal
      // flow doesn't do during mount. This doesn't happen at the root because
      // the root always starts with a "current" with a null child.
      // TODO: Consider unifying this with how the root works.
      workInProgress.child = reconcileChildFibersInPlace(
        workInProgress,
        workInProgress.child,
        nextChildren,
        priorityLevel
      );
      markChildAsProgressed(current, workInProgress, priorityLevel);
    } else {
      reconcileChildren(current, workInProgress, nextChildren);
    }
  }

  /*
  function reuseChildrenEffects(returnFiber : Fiber, firstChild : Fiber) {
    let child = firstChild;
    do {
      // Ensure that the first and last effect of the parent corresponds
      // to the children's first and last effect.
      if (!returnFiber.firstEffect) {
        returnFiber.firstEffect = child.firstEffect;
      }
      if (child.lastEffect) {
        if (returnFiber.lastEffect) {
          returnFiber.lastEffect.nextEffect = child.firstEffect;
        }
        returnFiber.lastEffect = child.lastEffect;
      }
    } while (child = child.sibling);
  }
  */

  function bailoutOnAlreadyFinishedWork(current, workInProgress : Fiber) : ?Fiber {
    const priorityLevel = workInProgress.pendingWorkPriority;
    const isHostComponent = workInProgress.tag === 5;

    if (isHostComponent &&
        workInProgress.memoizedProps.hidden &&
        workInProgress.pendingWorkPriority !== 6) {
      // This subtree still has work, but it should be deprioritized so we need
      // to bail out and not do any work yet.
      // TODO: It would be better if this tree got its correct priority set
      // during scheduleUpdate instead because otherwise we'll start a higher
      // priority reconciliation first before we can get down here. However,
      // that is a bit tricky since workInProgress and current can have
      // different "hidden" settings.
      let child = workInProgress.progressedChild;
      while (child) {
        // To ensure that this subtree gets its priority reset, the children
        // need to be reset.
        child.pendingWorkPriority = 6;
        child = child.sibling;
      }
      return null;
    }

    // TODO: We should ideally be able to bail out early if the children have no
    // more work to do. However, since we don't have a separation of this
    // Fiber's priority and its children yet - we don't know without doing lots
    // of the same work we do anyway. Once we have that separation we can just
    // bail out here if the children has no more work at this priority level.
    // if (workInProgress.priorityOfChildren <= priorityLevel) {
    //   // If there are side-effects in these children that have not yet been
    //   // committed we need to ensure that they get properly transferred up.
    //   if (current && current.child !== workInProgress.child) {
    //     reuseChildrenEffects(workInProgress, child);
    //   }
    //   return null;
    // }

    if (current && workInProgress.child === current.child) {
      // If we had any progressed work already, that is invalid at this point so
      // let's throw it out.
      clearDeletions(workInProgress);
    }

    cloneChildFibers(current, workInProgress);
    markChildAsProgressed(current, workInProgress, priorityLevel);

    // Put context on the stack because we will work on children
    if (isHostComponent) {
      pushHostContext(workInProgress);
    } else {
      switch (workInProgress.tag) {
        case 2:
          if (isContextProvider(workInProgress)) {
            pushContextProvider(workInProgress, false);
          }
          break;
        case 3:
        case 4:
          pushHostContainer(workInProgress.stateNode.containerInfo);
          break;
      }
    }
    // TODO: this is annoyingly duplicating non-jump codepaths.

    return workInProgress.child;
  }

  function bailoutOnLowPriority(current, workInProgress) {
    if (workInProgress.tag === 4) {
      pushHostContainer(workInProgress.stateNode.containerInfo);
    }
    // TODO: What if this is currently in progress?
    // How can that happen? How is this not being cloned?
    return null;
  }

  function beginWork(current : ?Fiber, workInProgress : Fiber, priorityLevel : PriorityLevel) : ?Fiber {
    if (!workInProgress.return) {
      // Don't start new work with context on the stack.
      resetContext();
      resetHostContainer();
    }

    if (workInProgress.pendingWorkPriority === 0 ||
        workInProgress.pendingWorkPriority > priorityLevel) {
      return bailoutOnLowPriority(current, workInProgress);
    }

    // If we don't bail out, we're going be recomputing our children so we need
    // to drop our effect list.
    workInProgress.firstEffect = null;
    workInProgress.lastEffect = null;

    if (workInProgress.progressedPriority === priorityLevel) {
      // If we have progressed work on this priority level already, we can
      // proceed this that as the child.
      workInProgress.child = workInProgress.progressedChild;
    }

    if ((workInProgress.pendingProps === null || (
      workInProgress.memoizedProps !== null &&
      workInProgress.pendingProps === workInProgress.memoizedProps
      )) &&
      workInProgress.updateQueue === null &&
      !hasContextChanged()) {
      return bailoutOnAlreadyFinishedWork(current, workInProgress);
    }

    switch (workInProgress.tag) {
      case 0:
        return mountIndeterminateComponent(current, workInProgress);
      case 1:
        return updateFunctionalComponent(current, workInProgress);
      case 2:
        return updateClassComponent(current, workInProgress);
      case 3: {
        const root = (workInProgress.stateNode : FiberRoot);
        if (root.pendingContext) {
          pushTopLevelContextObject(
            root.pendingContext,
            root.pendingContext !== root.context
          );
        } else {
          pushTopLevelContextObject(root.context, false);
        }
        pushHostContainer(workInProgress.stateNode.containerInfo);
        reconcileChildren(current, workInProgress, workInProgress.pendingProps);
        // A yield component is just a placeholder, we can just run through the
        // next one immediately.
        return workInProgress.child;
      }
      case 5:
        return updateHostComponent(current, workInProgress);
      case 6:
        // Nothing to do here. This is terminal. We'll do the completion step
        // immediately after.
        return null;
      case 8:
        // This is a restart. Reset the tag to the initial phase.
        workInProgress.tag = 7;
        // Intentionally fall through since this is now the same.
      case 7:
        updateCoroutineComponent(current, workInProgress);
        // This doesn't take arbitrary time so we could synchronously just begin
        // eagerly do the work of workInProgress.child as an optimization.
        return workInProgress.child;
      case 9:
        // A yield component is just a placeholder, we can just run through the
        // next one immediately.
        return null;
      case 4:
        pushHostContainer(workInProgress.stateNode.containerInfo);
        updatePortalComponent(current, workInProgress);
        return workInProgress.child;
      case 10:
        updateFragment(current, workInProgress);
        return workInProgress.child;
      default:
        throw new Error('Unknown unit of work tag');
    }
  }

  function beginFailedWork(current : ?Fiber, workInProgress : Fiber, priorityLevel : PriorityLevel) {
    if (workInProgress.tag !== 2 &&
        workInProgress.tag !== 3) {
      throw new Error('Invalid type of work');
    }

    // Add an error effect so we can handle the error during the commit phase
    workInProgress.effectTag |= 32;

    if (workInProgress.pendingWorkPriority === 0 ||
        workInProgress.pendingWorkPriority > priorityLevel) {
      return bailoutOnLowPriority(current, workInProgress);
    }

    // If we don't bail out, we're going be recomputing our children so we need
    // to drop our effect list.
    workInProgress.firstEffect = null;
    workInProgress.lastEffect = null;

    // Unmount the current children as if the component rendered null
    const nextChildren = null;
    reconcileChildren(current, workInProgress, nextChildren);
    return workInProgress.child;
  }



// HostContext

  // Context stack is reused across the subtrees.
  // We use a null sentinel on the fiber stack to separate them.
  let contextFibers : Array<Fiber | null> | null = null;
  let contextValues : Array<CX | null> | null = null;
  let contextDepth : number = -1;
  // Current root instance.
  let rootInstance : C | null = null;
  // A stack of outer root instances if we're in a portal.
  let portalStack : Array<C | null> = [];
  let portalDepth : number = -1;

  function getRootHostContainer() : C {
    if (rootInstance == null) {
      throw new Error('Expected root container to exist.');
    }
    return rootInstance;
  }

  function pushHostContainer(nextRootInstance : C) {
    if (rootInstance == null) {
      // We're entering a root.
      rootInstance = nextRootInstance;
    } else {
      // We're entering a portal.
      // Save the current root to the portal stack.
      portalDepth++;
      portalStack[portalDepth] = rootInstance;
      rootInstance = nextRootInstance;
      // Delimit subtree context with a sentinel so we know where to pop later.
      if (contextFibers != null && contextValues != null) {
        contextDepth++;
        contextFibers[contextDepth] = null;
        contextValues[contextDepth] = null;
      }
    }
  }

  function popHostContainer() {
    if (portalDepth === -1) {
      // We're popping the root.
      rootInstance = null;
      contextDepth = -1;
    } else {
      // We're popping a portal.
      // Restore the root instance.
      rootInstance = portalStack[portalDepth];
      portalStack[portalDepth] = null;
      portalDepth--;
      // If we pushed any context while in a portal, we need to roll it back.
      if (contextDepth > -1 && contextFibers != null) {
        // Pop the context until we meet the null sentinel on fiber stack.
        while (contextDepth > -1 && contextFibers[contextDepth] != null) {
          contextDepth--;
        }
        // We have found the null sentinel. Pop past it.
        if (contextDepth > -1 && contextFibers[contextDepth] == null) {
          contextDepth--;
        }
      }
    }
  }

  function getHostContext() : CX | null {
    if (contextDepth === -1) {
      return null;
    }
    if (contextValues == null) {
      throw new Error('Expected context values to exist.');
    }
    return contextValues[contextDepth];
  }

  function pushHostContext(fiber : Fiber) : void {
    const parentHostContext = getHostContext();
    const currentHostContext = getChildHostContext(parentHostContext, fiber.type);
    if (parentHostContext === currentHostContext) {
      return;
    }
    if (contextFibers == null) {
      contextFibers = [];
    }
    if (contextValues == null) {
      contextValues = [];
    }
    contextDepth++;
    contextFibers[contextDepth] = fiber;
    contextValues[contextDepth] = currentHostContext;
  }

  function popHostContext(fiber : Fiber) : void {
    if (contextDepth === -1) {
      return;
    }
    if (contextFibers == null || contextValues == null) {
      throw new Error('Expected host context stacks to exist when index is more than -1.');
    }
    if (fiber !== contextFibers[contextDepth]) {
      return;
    }
    contextFibers[contextDepth] = null;
    contextValues[contextDepth] = null;
    contextDepth--;
  }

  function resetHostContainer() {
    // Reset portal stack pointer because we're starting from the very top.
    portalDepth = -1;
    // Reset current container state.
    // Don't reset arrays because we reuse them.
    rootInstance = null;
    contextDepth = -1;
  }



  // FiberScheduler
  // Scheduler

  // The priority level to use when scheduling an update.
  let priorityContext : PriorityLevel = useSyncScheduling ?
    1 :
    5;

  // Keeps track of whether we're currently in a work loop. Used to batch
  // nested updates.
  let isPerformingWork : boolean = false;

  // The next work in progress fiber that we're currently working on.
  let nextUnitOfWork : ?Fiber = null;
  let nextPriorityLevel : PriorityLevel = 0;

  // The next fiber with an effect, during the commit phase.
  let nextEffect : ?Fiber = null;

  let pendingCommit : ?Fiber = null;

  // Linked list of roots with scheduled work on them.
  let nextScheduledRoot : ?FiberRoot = null;
  let lastScheduledRoot : ?FiberRoot = null;

  // Keep track of which host environment callbacks are scheduled.
  let isAnimationCallbackScheduled : boolean = false;
  let isDeferredCallbackScheduled : boolean = false;

  // Keep track of which fibers have captured an error that need to be handled.
  // Work is removed from this collection after unstable_handleError is called.
  let capturedErrors : Map<Fiber, Error> | null = null;
  // Keep track of which fibers have failed during the current batch of work.
  // This is a different set than capturedErrors, because it is not reset until
  // the end of the batch. This is needed to propagate errors correctly if a
  // subtree fails more than once.
  let failedBoundaries : Set<Fiber> | null = null;
  // Error boundaries that captured an error during the current commit.
  let commitPhaseBoundaries : Set<Fiber> | null = null;
  let firstUncaughtError : Error | null = null;

  let isCommitting : boolean = false;
  let isUnmounting : boolean = false;

  function scheduleAnimationCallback(callback) {
    if (!isAnimationCallbackScheduled) {
      isAnimationCallbackScheduled = true;
      hostScheduleAnimationCallback(callback);
    }
  }

  function scheduleDeferredCallback(callback) {
    if (!isDeferredCallbackScheduled) {
      isDeferredCallbackScheduled = true;
      hostScheduleDeferredCallback(callback);
    }
  }

  function findNextUnitOfWork() {
    // Clear out roots with no more work on them, or if they have uncaught errors
    while (nextScheduledRoot && nextScheduledRoot.current.pendingWorkPriority === 0) {
      // Unschedule this root.
      nextScheduledRoot.isScheduled = false;
      // Read the next pointer now.
      // We need to clear it in case this root gets scheduled again later.
      const next = nextScheduledRoot.nextScheduledRoot;
      nextScheduledRoot.nextScheduledRoot = null;
      // Exit if we cleared all the roots and there's no work to do.
      if (nextScheduledRoot === lastScheduledRoot) {
        nextScheduledRoot = null;
        lastScheduledRoot = null;
        nextPriorityLevel = 0;
        return null;
      }
      // Continue with the next root.
      // If there's no work on it, it will get unscheduled too.
      nextScheduledRoot = next;
    }

    let root = nextScheduledRoot;
    let highestPriorityRoot = null;
    let highestPriorityLevel = 0;
    while (root) {
      if (root.current.pendingWorkPriority !== 0 && (
          highestPriorityLevel === 0 ||
          highestPriorityLevel > root.current.pendingWorkPriority)) {
        highestPriorityLevel = root.current.pendingWorkPriority;
        highestPriorityRoot = root;
      }
      // We didn't find anything to do in this root, so let's try the next one.
      root = root.nextScheduledRoot;
    }
    if (highestPriorityRoot) {
      nextPriorityLevel = highestPriorityLevel;
      return cloneFiber(
        highestPriorityRoot.current,
        highestPriorityLevel
      );
    }

    nextPriorityLevel = 0;
    return null;
  }

  function commitAllHostEffects(finishedWork : Fiber) {
    while (nextEffect) {
      if (nextEffect.effectTag & 8) {
        config.resetTextContent(nextEffect.stateNode);
      }

      // The following switch statement is only concerned about placement,
      // updates, and deletions. To avoid needing to add a case for every
      // possible bitmap value, we remove the secondary effects from the
      // effect tag and switch on that value.
      let primaryEffectTag = nextEffect.effectTag & ~(16 | 32 | 8);
      switch (primaryEffectTag) {
        case 1: {
          commitPlacement(nextEffect);
          // Clear the "placement" from effect tag so that we know that this is inserted, before
          // any life-cycles like componentDidMount gets called.
          // TODO: findDOMNode doesn't rely on this any more but isMounted
          // does and isMounted is deprecated anyway so we should be able
          // to kill this.
          nextEffect.effectTag &= ~1;
          break;
        }
        case 3: {
          // 1
          commitPlacement(nextEffect);
          // Clear the "placement" from effect tag so that we know that this is inserted, before
          // any life-cycles like componentDidMount gets called.
          nextEffect.effectTag &= ~1;

          // 2
          const current = nextEffect.alternate;
          commitWork(current, nextEffect);
          break;
        }
        case 2: {
          const current = nextEffect.alternate;
          commitWork(current, nextEffect);
          break;
        }
        case 4: {
          isUnmounting = true;
          commitDeletion(nextEffect);
          isUnmounting = false;
          break;
        }
      }
      nextEffect = nextEffect.nextEffect;
    }

    // If the root itself had an effect, we perform that since it is
    // not part of the effect list.
    if (finishedWork.effectTag !== 0) {
      const current = finishedWork.alternate;
      commitWork(current, finishedWork);
    }
  }

  function commitAllLifeCycles(finishedWork : Fiber) {
    while (nextEffect) {
      const current = nextEffect.alternate;
      // Use Task priority for lifecycle updates
      if (nextEffect.effectTag & (2 | 16)) {
        commitLifeCycles(current, nextEffect);
      }

      if (nextEffect.effectTag & 32) {
        commitErrorHandling(nextEffect);
      }

      const next = nextEffect.nextEffect;
      // Ensure that we clean these up so that we don't accidentally keep them.
      // I'm not actually sure this matters because we can't reset firstEffect
      // and lastEffect since they're on every node, not just the effectful
      // ones. So we have to clean everything as we reuse nodes anyway.
      nextEffect.nextEffect = null;
      // Ensure that we reset the effectTag here so that we can rely on effect
      // tags to reason about the current life-cycle.
      nextEffect = next;
    }

    // If the root itself had an effect, we perform that since it is
    // not part of the effect list.
    if (finishedWork.effectTag !== 0) {
      const current = finishedWork.alternate;
      commitLifeCycles(current, finishedWork);
      if (finishedWork.effectTag & 32) {
        commitErrorHandling(finishedWork);
      }
    }
  }

  function commitAllWork(finishedWork : Fiber) {
    // We keep track of this so that captureError can collect any boundaries
    // that capture an error during the commit phase. The reason these aren't
    // local to this function is because errors that occur during cWU are
    // captured elsewhere, to prevent the unmount from being interrupted.
    isCommitting = true;

    pendingCommit = null;
    const root : FiberRoot = (finishedWork.stateNode : any);
    if (root.current === finishedWork) {
      throw new Error(
        'Cannot commit the same tree as before. This is probably a bug ' +
        'related to the return field.'
      );
    }
    root.current = finishedWork;

    // Updates that occur during the commit phase should have Task priority
    const previousPriorityContext = priorityContext;
    priorityContext = 2;

    prepareForCommit();

    // Commit all the side-effects within a tree. We'll do this in two passes.
    // The first pass performs all the host insertions, updates, deletions and
    // ref unmounts.
    nextEffect = finishedWork.firstEffect;
    while (true) {
      try {
        commitAllHostEffects(finishedWork);
      } catch (error) {
        captureError(nextEffect, error);
        // Clean-up
        isUnmounting = false;
        if (nextEffect) {
          nextEffect = nextEffect.nextEffect;
          continue;
        }
      }
      break;
    }

    resetAfterCommit();
    // We didn't pop the host root in the complete phase because we still needed
    // it for the commitUpdate() calls, but now we can reset host context.
    resetHostContainer();

    // In the second pass we'll perform all life-cycles and ref callbacks.
    // Life-cycles happen as a separate pass so that all placements, updates,
    // and deletions in the entire tree have already been invoked.
    nextEffect = finishedWork.firstEffect;
    while (true) {
      try {
        commitAllLifeCycles(finishedWork, nextEffect);
      } catch (error) {
        captureError(nextEffect || null, error);
        if (nextEffect) {
          const next = nextEffect.nextEffect;
          nextEffect.nextEffect = null;
          nextEffect = next;
        }
        continue;
      }
      break;
    }

    isCommitting = false;

    // If we caught any errors during this commit, schedule their boundaries
    // to update.
    if (commitPhaseBoundaries) {
      commitPhaseBoundaries.forEach(scheduleUpdate);
      commitPhaseBoundaries = null;
    }

    priorityContext = previousPriorityContext;
  }

  function resetWorkPriority(workInProgress : Fiber) {
    let newPriority = 0;
    // progressedChild is going to be the child set with the highest priority.
    // Either it is the same as child, or it just bailed out because it choose
    // not to do the work.
    let child = workInProgress.progressedChild;
    while (child) {
      // Ensure that remaining work priority bubbles up.
      if (child.pendingWorkPriority !== 0 &&
          (newPriority === 0 ||
          newPriority > child.pendingWorkPriority)) {
        newPriority = child.pendingWorkPriority;
      }
      child = child.sibling;
    }
    workInProgress.pendingWorkPriority = newPriority;
  }

  function completeUnitOfWork(workInProgress : Fiber) : ?Fiber {
    while (true) {
      // The current, flushed, state of this fiber is the alternate.
      // Ideally nothing should rely on this, but relying on it here
      // means that we don't need an additional field on the work in
      // progress.
      const current = workInProgress.alternate;
      const next = completeWork(current, workInProgress);

      // The work is now done. We don't need this anymore. This flags
      // to the system not to redo any work here.
      workInProgress.pendingProps = null;
      workInProgress.updateQueue = null;

      const returnFiber = workInProgress.return;
      const siblingFiber = workInProgress.sibling;

      resetWorkPriority(workInProgress);

      if (next) {
        // If completing this work spawned new work, do that next. We'll come
        // back here again.
        return next;
      }

      if (returnFiber) {
        // Append all the effects of the subtree and this fiber onto the effect
        // list of the parent. The completion order of the children affects the
        // side-effect order.
        if (!returnFiber.firstEffect) {
          returnFiber.firstEffect = workInProgress.firstEffect;
        }
        if (workInProgress.lastEffect) {
          if (returnFiber.lastEffect) {
            returnFiber.lastEffect.nextEffect = workInProgress.firstEffect;
          }
          returnFiber.lastEffect = workInProgress.lastEffect;
        }

        // If this fiber had side-effects, we append it AFTER the children's
        // side-effects. We can perform certain side-effects earlier if
        // needed, by doing multiple passes over the effect list. We don't want
        // to schedule our own side-effect on our own list because if end up
        // reusing children we'll schedule this effect onto itself since we're
        // at the end.
        if (workInProgress.effectTag !== 0) {
          if (returnFiber.lastEffect) {
            returnFiber.lastEffect.nextEffect = workInProgress;
          } else {
            returnFiber.firstEffect = workInProgress;
          }
          returnFiber.lastEffect = workInProgress;
        }
      }

      if (siblingFiber) {
        // If there is more work to do in this returnFiber, do that next.
        return siblingFiber;
      } else if (returnFiber) {
        // If there's no more work in this returnFiber. Complete the returnFiber.
        workInProgress = returnFiber;
        continue;
      } else {
        // We've reached the root. Unless we're current performing deferred
        // work, we should commit the completed work immediately. If we are
        // performing deferred work, returning null indicates to the caller
        // that we just completed the root so they can handle that case correctly.
        if (nextPriorityLevel < 4) {
          // Otherwise, we should commit immediately.
          commitAllWork(workInProgress);
        } else {
          pendingCommit = workInProgress;
        }
        return null;
      }
    }
  }

  function performUnitOfWork(workInProgress : Fiber) : ?Fiber {
    // The current, flushed, state of this fiber is the alternate.
    // Ideally nothing should rely on this, but relying on it here
    // means that we don't need an additional field on the work in
    // progress.
    const current = workInProgress.alternate;

    // See if beginning this work spawns more work.
    let next = beginWork(current, workInProgress, nextPriorityLevel);


    if (!next) {

      // If this doesn't spawn new work, complete the current work.
      next = completeUnitOfWork(workInProgress);

    }

    ReactCurrentOwner.current = null;

    return next;
  }

  function performFailedUnitOfWork(workInProgress : Fiber) : ?Fiber {
    // The current, flushed, state of this fiber is the alternate.
    // Ideally nothing should rely on this, but relying on it here
    // means that we don't need an additional field on the work in
    // progress.
    const current = workInProgress.alternate;


    // See if beginning this work spawns more work.
    let next = beginFailedWork(current, workInProgress, nextPriorityLevel);


    if (!next) {
      // If this doesn't spawn new work, complete the current work.
      next = completeUnitOfWork(workInProgress);
    }

    ReactCurrentOwner.current = null;

    return next;
  }

  function performDeferredWork(deadline) {
    // We pass the lowest deferred priority here because it acts as a minimum.
    // Higher priorities will also be performed.
    isDeferredCallbackScheduled = false;
    performWork(6, deadline);
  }

  function performAnimationWork() {
    isAnimationCallbackScheduled = false;
    performWork(3);
  }

  function clearErrors() {
    if (!nextUnitOfWork) {
      nextUnitOfWork = findNextUnitOfWork();
    }
    // Keep performing work until there are no more errors
    while (capturedErrors && capturedErrors.size &&
           nextUnitOfWork &&
           nextPriorityLevel !== 0 &&
           nextPriorityLevel <= 2) {
      if (hasCapturedError(nextUnitOfWork)) {
        // Use a forked version of performUnitOfWork
        nextUnitOfWork = performFailedUnitOfWork(nextUnitOfWork);
      } else {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
      }
      if (!nextUnitOfWork) {
        // If performUnitOfWork returns null, that means we just comitted
        // a root. Normally we'd need to clear any errors that were scheduled
        // during the commit phase. But we're already clearing errors, so
        // we can continue.
        nextUnitOfWork = findNextUnitOfWork();
      }
    }
  }

  function workLoop(priorityLevel, deadline : Deadline | null, deadlineHasExpired : boolean) : boolean {
    // Clear any errors.
    clearErrors();

    if (!nextUnitOfWork) {
      nextUnitOfWork = findNextUnitOfWork();
    }

    // If there's a deadline, and we're not performing Task work, perform work
    // using this loop that checks the deadline on every iteration.
    if (deadline && priorityLevel > 2) {
      // The deferred work loop will run until there's no time left in
      // the current frame.
      while (nextUnitOfWork && !deadlineHasExpired) {
        if (deadline.timeRemaining() > timeHeuristicForUnitOfWork) {
          nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
          // In a deferred work batch, iff nextUnitOfWork returns null, we just
          // completed a root and a pendingCommit exists. Logically, we could
          // omit either of the checks in the following condition, but we need
          // both to satisfy Flow.
          if (!nextUnitOfWork && pendingCommit) {
            // If we have time, we should commit the work now.
            if (deadline.timeRemaining() > timeHeuristicForUnitOfWork) {
              commitAllWork(pendingCommit);
              nextUnitOfWork = findNextUnitOfWork();
              // Clear any errors that were scheduled during the commit phase.
              clearErrors();
            } else {
              deadlineHasExpired = true;
            }
            // Otherwise the root will committed in the next frame.
          }
        } else {
          deadlineHasExpired = true;
        }
      }
    } else {
      // If there's no deadline, or if we're performing Task work, use this loop
      // that doesn't check how much time is remaining. It will keep running
      // until we run out of work at this priority level.
      while (nextUnitOfWork &&
             nextPriorityLevel !== 0 &&
             nextPriorityLevel <= priorityLevel) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        if (!nextUnitOfWork) {
          nextUnitOfWork = findNextUnitOfWork();
          // performUnitOfWork returned null, which means we just comitted a
          // root. Clear any errors that were scheduled during the commit phase.
          clearErrors();
        }
      }
    }

    return deadlineHasExpired;
  }

  function performWork(priorityLevel : PriorityLevel, deadline : Deadline | null) {
    if (isPerformingWork) {
      throw new Error('performWork was called recursively.');
    }
    isPerformingWork = true;
    const isPerformingDeferredWork = Boolean(deadline);
    let deadlineHasExpired = false;

    // This outer loop exists so that we can restart the work loop after
    // catching an error. It also lets us flush Task work at the end of a
    // deferred batch.
    while (priorityLevel !== 0) {
      if (priorityLevel >= 4 && !deadline) {
        throw new Error(
          'Cannot perform deferred work without a deadline.'
        );
      }

      // Before starting any work, check to see if there are any pending
      // commits from the previous frame. An exception is if we're flushing
      // Task work in a deferred batch and the pending commit does not
      // have Task priority.
      if (pendingCommit) {
        const isFlushingTaskWorkInDeferredBatch =
          priorityLevel === 2 &&
          isPerformingDeferredWork &&
          pendingCommit.pendingWorkPriority !== 2;
        if (!isFlushingTaskWorkInDeferredBatch) {
          commitAllWork(pendingCommit);
        }
      }

      // Nothing in performWork should be allowed to throw. All unsafe
      // operations must happen within workLoop, which is extracted to a
      // separate function so that it can be optimized by the JS engine.
      try {
        deadlineHasExpired = workLoop(priorityLevel, deadline, deadlineHasExpired);
      } catch (error) {
        // We caught an error during either the begin or complete phases.
        const failedWork = nextUnitOfWork;

        // "Capture" the error by finding the nearest boundary. If there is no
        // error boundary, the nearest host container acts as one. If
        // captureError returns null, the error was intentionally ignored.
        const maybeBoundary = captureError(failedWork, error);
        if (maybeBoundary) {
          const boundary = maybeBoundary;

          // Complete the boundary as if it rendered null. This will unmount
          // the failed tree.
          beginFailedWork(boundary.alternate, boundary, priorityLevel);

          // The next unit of work is now the boundary that captured the error.
          // Conceptually, we're unwinding the stack. We need to unwind the
          // context stack, too, from the failed work to the boundary that
          // captured the error.
          // TODO: If we set the memoized props in beginWork instead of
          // completeWork, rather than unwind the stack, we can just restart
          // from the root. Can't do that until then because without memoized
          // props, the nodes higher up in the tree will rerender unnecessarily.
          if (failedWork) {
            unwindContext(failedWork, boundary);
            unwindHostContext(failedWork, boundary);
          }
          nextUnitOfWork = completeUnitOfWork(boundary);
        }
        // Continue performing work
        continue;
      }

      // Stop performing work
      priorityLevel = 0;

      // If have we more work, and we're in a deferred batch, check to see
      // if the deadline has expired.
      if (nextPriorityLevel !== 0 && isPerformingDeferredWork && !deadlineHasExpired) {
        // We have more time to do work.
        priorityLevel = nextPriorityLevel;
        continue;
      }

      // There might be work left. Depending on the priority, we should
      // either perform it now or schedule a callback to perform it later.
      switch (nextPriorityLevel) {
        case 1:
        case 2:
          // Perform work immediately by switching the priority level
          // and continuing the loop.
          priorityLevel = nextPriorityLevel;
          break;
        case 3:
          scheduleAnimationCallback(performAnimationWork);
          // Even though the next unit of work has animation priority, there
          // may still be deferred work left over as well. I think this is
          // only important for unit tests. In a real app, a deferred callback
          // would be scheduled during the next animation frame.
          scheduleDeferredCallback(performDeferredWork);
          break;
        case 4:
        case 5:
        case 6:
          scheduleDeferredCallback(performDeferredWork);
          break;
      }
    }

    // We're done performing work. Time to clean up.
    isPerformingWork = false;
    capturedErrors = null;
    failedBoundaries = null;

    // It's now safe to throw the first uncaught error.
    if (firstUncaughtError) {
      let e = firstUncaughtError;
      firstUncaughtError = null;
      throw e;
    }
  }

  // Returns the boundary that captured the error, or null if the error is ignored
  function captureError(failedWork : ?Fiber, error : Error) : ?Fiber {
    // It is no longer valid because we exited the user code.
    ReactCurrentOwner.current = null;
    // It is no longer valid because this unit of work failed.
    nextUnitOfWork = null;

    // Search for the nearest error boundary.
    let boundary : ?Fiber = null;
    if (failedWork) {
      // Host containers are a special case. If the failed work itself is a host
      // container, then it acts as its own boundary. In all other cases, we
      // ignore the work itself and only search through the parents.
      if (failedWork.tag === 3) {
        boundary = failedWork;
      } else {
        let node = failedWork.return;
        while (node && !boundary) {
          if (node.tag === 2) {
            const instance = node.stateNode;
            if (typeof instance.unstable_handleError === 'function') {
              if (isFailedBoundary(node)) {
                // This boundary is already in a failed state. The error should
                // propagate to the next boundary — except in the
                // following cases:

                // If we're currently unmounting, that means this error was
                // thrown while unmounting a failed subtree. We should ignore
                // the error.
                if (isUnmounting) {
                  return null;
                }

                // If we're in the commit phase, we should check to see if
                // this boundary already captured an error during this commit.
                // This case exists because multiple errors can be thrown during
                // a single commit without interruption.
                if (commitPhaseBoundaries && (
                  commitPhaseBoundaries.has(node) ||
                  (node.alternate) && commitPhaseBoundaries.has(node.alternate)
                )) {
                  // If so, we should ignore this error.
                  return null;
                }
              } else {
                // Found an error boundary!
                boundary = node;
              }
            }
          } else if (node.tag === 3) {
            // Treat the root like a no-op error boundary.
            boundary = node;
          }
          node = node.return;
        }
      }
    }

    if (boundary) {
      // Add to the collection of failed boundaries. This lets us know that
      // subsequent errors in this subtree should propagate to the next boundary.
      if (!failedBoundaries) {
        failedBoundaries = new Set();
      }
      failedBoundaries.add(boundary);

      // Add to the collection of captured errors. This is stored as a global
      // map of errors keyed by the boundaries that capture them. We mostly
      // use this Map as a Set; it's a Map only to avoid adding a field to Fiber
      // to store the error.
      if (!capturedErrors) {
        capturedErrors = new Map();
      }

      capturedErrors.set(boundary, error);
      // If we're in the commit phase, defer scheduling an update on the
      // boundary until after the commit is complete
      if (isCommitting) {
        if (!commitPhaseBoundaries) {
          commitPhaseBoundaries = new Set();
        }
        commitPhaseBoundaries.add(boundary);
      } else {
        // Otherwise, schedule an update now. Error recovery has Task priority.
        const previousPriorityContext = priorityContext;
        priorityContext = 2;
        scheduleUpdate(boundary);
        priorityContext = previousPriorityContext;
      }
      return boundary;
    } else if (!firstUncaughtError) {
      // If no boundary is found, we'll need to throw the error
      firstUncaughtError = error;
    }
    return null;
  }

  function hasCapturedError(fiber : Fiber) : boolean {
    return Boolean(
      capturedErrors &&
      (capturedErrors.has(fiber) || (fiber.alternate && capturedErrors.has(fiber.alternate)))
    );
  }

  function isFailedBoundary(fiber : Fiber) : boolean {
    const res = Boolean(
      failedBoundaries &&
      (failedBoundaries.has(fiber) || (fiber.alternate && failedBoundaries.has(fiber.alternate)))
    );
    return res;
  }

  function commitErrorHandling(effectfulFiber : Fiber) {
    let error;
    if (capturedErrors) {
      error = capturedErrors.get(effectfulFiber);
      capturedErrors.delete(effectfulFiber);
      if (!error) {
        if (effectfulFiber.alternate) {
          effectfulFiber = effectfulFiber.alternate;
          error = capturedErrors.get(effectfulFiber);
          capturedErrors.delete(effectfulFiber);
        }
      }
    }

    if (!error) {
      throw new Error('No error for given unit of work.');
    }

    switch (effectfulFiber.tag) {
      case 2:
        const instance = effectfulFiber.stateNode;
        // Allow the boundary to handle the error, usually by scheduling
        // an update to itself
        instance.unstable_handleError(error);
        return;
      case 3:
        if (!firstUncaughtError) {
          // If this is the host container, we treat it as a no-op error
          // boundary. We'll throw the first uncaught error once it's safe to
          // do so, at the end of the batch.
          firstUncaughtError = error;
        }
        return;
      default:
        throw new Error('Invalid type of work.');
    }
  }

  function unwindHostContext(from : Fiber, to: Fiber) {
    let node = from;
    while (node && (node !== to) && (node.alternate !== to)) {
      switch (node.tag) {
        case 5:
          popHostContext(node);
          break;
        case 3:
          popHostContainer();
          break;
        case 4:
          popHostContainer();
          break;
      }
      node = node.return;
    }
  }

  function scheduleWork(root : FiberRoot) {
    let priorityLevel = priorityContext;

    // If we're in a batch, switch to task priority
    if (priorityLevel === 1 && isPerformingWork) {
      priorityLevel = 2;
    }

    scheduleWorkAtPriority(root, priorityLevel);
  }

  function scheduleWorkAtPriority(root : FiberRoot, priorityLevel : PriorityLevel) {
    // Set the priority on the root, without deprioritizing
    if (root.current.pendingWorkPriority === 0 ||
        priorityLevel <= root.current.pendingWorkPriority) {
      root.current.pendingWorkPriority = priorityLevel;
    }
    if (root.current.alternate) {
      if (root.current.alternate.pendingWorkPriority === 0 ||
          priorityLevel <= root.current.alternate.pendingWorkPriority) {
        root.current.alternate.pendingWorkPriority = priorityLevel;
      }
    }

    if (!root.isScheduled) {
      root.isScheduled = true;
      if (lastScheduledRoot) {
        // Schedule ourselves to the end.
        lastScheduledRoot.nextScheduledRoot = root;
        lastScheduledRoot = root;
      } else {
        // We're the only work scheduled.
        nextScheduledRoot = root;
        lastScheduledRoot = root;
      }
    }

    if (priorityLevel <= nextPriorityLevel) {
      // We must reset the current unit of work pointer so that we restart the
      // search from the root during the next tick, in case there is now higher
      // priority work somewhere earlier than before.
      nextUnitOfWork = null;
    }

    // Depending on the priority level, either perform work now or schedule
    // a callback to perform work later.
    switch (priorityLevel) {
      case 1:
        // Perform work immediately
        performWork(1);
        return;
      case 2:
        // If we're already performing work, Task work will be flushed before
        // exiting the current batch. So we can skip it here.
        if (!isPerformingWork) {
          performWork(2);
        }
        return;
      case 3:
        scheduleAnimationCallback(performAnimationWork);
        return;
      case 4:
      case 5:
      case 6:
        scheduleDeferredCallback(performDeferredWork);
        return;
    }
  }

  function scheduleUpdate(fiber : Fiber) {
    let priorityLevel = priorityContext;
    // If we're in a batch, downgrade sync priority to task priority
    if (priorityLevel === 1 && isPerformingWork) {
      priorityLevel = 2;
    }

    let node = fiber;
    let shouldContinue = true;
    while (node && shouldContinue) {
      // Walk the parent path to the root and update each node's priority. Once
      // we reach a node whose priority matches (and whose alternate's priority
      // matches) we can exit safely knowing that the rest of the path is correct.
      shouldContinue = false;
      if (node.pendingWorkPriority === 0 ||
          node.pendingWorkPriority >= priorityLevel) {
        // Priority did not match. 2 and keep going.
        shouldContinue = true;
        node.pendingWorkPriority = priorityLevel;
      }
      if (node.alternate) {
        if (node.alternate.pendingWorkPriority === 0 ||
            node.alternate.pendingWorkPriority >= priorityLevel) {
          // Priority did not match. 2 and keep going.
          shouldContinue = true;
          node.alternate.pendingWorkPriority = priorityLevel;
        }
      }
      if (!node.return) {
        if (node.tag === 3) {
          const root : FiberRoot = (node.stateNode : any);
          scheduleWorkAtPriority(root, priorityLevel);
        } else {
          // TODO: Warn about setting state on an unmounted component.
          return;
        }
      }
      node = node.return;
    }
  }

  function performWithPriority(priorityLevel : PriorityLevel, fn : Function) {
    const previousPriorityContext = priorityContext;
    priorityContext = priorityLevel;
    try {
      fn();
    } finally {
      priorityContext = previousPriorityContext;
    }
  }

  function batchedUpdates<A, R>(fn : (a: A) => R, a : A) : R {
    const previousIsPerformingWork = isPerformingWork;
    // Simulate that we're performing work so that sync work is batched
    isPerformingWork = true;
    try {
      return fn(a);
    } finally {
      isPerformingWork = previousIsPerformingWork;
      // If we're not already performing work, we need to flush any task work
      // that was created by the user-provided function.
      if (!isPerformingWork) {
        performWork(2);
      }
    }
  }

  function syncUpdates<A>(fn : () => A) : A {
    const previousPriorityContext = priorityContext;
    priorityContext = 1;
    try {
      return fn();
    } finally {
      priorityContext = previousPriorityContext;
    }
  }

// FiberReconciler

    function mountContainer(element : ReactElement<any>, containerInfo : C, parentComponent : ?ReactComponent<any, any, any>, callback: ?Function) : OpaqueNode {
      const context = getContextForSubtree(parentComponent);
      const root = createFiberRoot(containerInfo, context);
      const container = root.current;
      if (callback) {
        const queue = createUpdateQueue(null);
        addCallbackToQueue(queue, callback);
        root.callbackList = queue;
      }
      // TODO: Use pending work/state instead of props.
      // TODO: This should not override the pendingWorkPriority if there is
      // higher priority work in the subtree.
      container.pendingProps = element;

      scheduleWork(root);

      // It may seem strange that we don't return the root here, but that will
      // allow us to have containers that are in the middle of the tree instead
      // of being roots.
      return container;
    }

    function updateContainer(element : ReactElement<any>, container : OpaqueNode, parentComponent : ?ReactComponent<any, any, any>, callback: ?Function) : void {
      // TODO: If this is a nested container, this won't be the root.
      const root : FiberRoot = (container.stateNode : any);
      if (callback) {
        const queue = root.callbackList ?
          root.callbackList :
          createUpdateQueue(null);
        addCallbackToQueue(queue, callback);
        root.callbackList = queue;
      }
      root.pendingContext = getContextForSubtree(parentComponent);
      // TODO: Use pending work/state instead of props.
      root.current.pendingProps = element;
      if (root.current.alternate) {
        root.current.alternate.pendingProps = element;
      }

      scheduleWork(root);
    }

    function unmountContainer(container : OpaqueNode) : void {
      // TODO: If this is a nested container, this won't be the root.
      const root : FiberRoot = (container.stateNode : any);
      // TODO: Use pending work/state instead of props.
      root.current.pendingProps = [];
      if (root.current.alternate) {
        root.current.alternate.pendingProps = [];
      }

      scheduleWork(root);

    }

    function getPublicRootInstance(container : OpaqueNode) : (ReactComponent<any, any, any> | I | TI | null) {
      const root : FiberRoot = (container.stateNode : any);
      const containerFiber = root.current;
      if (!containerFiber.child) {
        return null;
      }
      return containerFiber.child.stateNode;
    }

    function findHostInstance(fiber : Fiber) : I | TI | null {
      const hostFiber = findCurrentHostFiber(fiber);
      if (!hostFiber) {
        return null;
      }
      return hostFiber.stateNode;
    }





'use strict';


var ReactBrowserEventEmitter = require('ReactBrowserEventEmitter');
var ReactControlledComponent = require('ReactControlledComponent');
var ReactDOMComponentTree = require('ReactDOMComponentTree');
var ReactDOMFeatureFlags = require('ReactDOMFeatureFlags');
var ReactDOMInjection = require('ReactDOMInjection');
var ReactGenericBatching = require('ReactGenericBatching');
var ReactInputSelection = require('ReactInputSelection');
var ReactInstanceMap = require('ReactInstanceMap');
var ReactPortal = require('ReactPortal');

var findDOMNode = require('findDOMNode');
var invariant = require('invariant');
var warning = require('warning');

var { precacheFiberNode } = ReactDOMComponentTree;


// DOMComponent

'use strict';

var CSSPropertyOperations = require('CSSPropertyOperations');
var DOMNamespaces = require('DOMNamespaces');
var DOMProperty = require('DOMProperty');
var DOMPropertyOperations = require('DOMPropertyOperations');
var EventPluginRegistry = require('EventPluginRegistry');
var ReactBrowserEventEmitter = require('ReactBrowserEventEmitter');
var ReactDOMComponentTree = require('ReactDOMComponentTree');
var ReactDOMFiberInput = require('ReactDOMFiberInput');
var ReactDOMFiberOption = require('ReactDOMFiberOption');
var ReactDOMFiberSelect = require('ReactDOMFiberSelect');
var ReactDOMFiberTextarea = require('ReactDOMFiberTextarea');

var emptyFunction = require('emptyFunction');
var focusNode = require('focusNode');
var getCurrentOwnerName = require('getCurrentOwnerName');
var invariant = require('invariant');
var isEventSupported = require('isEventSupported');
var setInnerHTML = require('setInnerHTML');
var setTextContent = require('setTextContent');
var inputValueTracking = require('inputValueTracking');
var warning = require('warning');
var didWarnShadyDOM = false;

var listenTo = ReactBrowserEventEmitter.listenTo;
var registrationNameModules = EventPluginRegistry.registrationNameModules;

var DANGEROUSLY_SET_INNER_HTML = 'dangerouslySetInnerHTML';
var SUPPRESS_CONTENT_EDITABLE_WARNING = 'suppressContentEditableWarning';
var CHILDREN = 'children';
var STYLE = 'style';
var HTML = '__html';

var {
  svg: SVG_NAMESPACE,
  mathml: MATH_NAMESPACE,
} = DOMNamespaces;

// Node type for document fragments (Node.DOCUMENT_FRAGMENT_NODE).
var DOC_FRAGMENT_TYPE = 11;


function getDeclarationErrorAddendum() {
  var ownerName = getCurrentOwnerName();
  if (ownerName) {
    return ' This DOM node was rendered by `' + ownerName + '`.';
  }
  return '';
}

function assertValidProps(tag : string, props : ?Object) {
  if (!props) {
    return;
  }
  // Note the use of `==` which checks for null or undefined.
  if (voidElementTags[tag]) {
    invariant(
      props.children == null && props.dangerouslySetInnerHTML == null,
      '%s is a void element tag and must neither have `children` nor ' +
      'use `dangerouslySetInnerHTML`.%s',
      tag,
      getDeclarationErrorAddendum()
    );
  }
  if (props.dangerouslySetInnerHTML != null) {
    invariant(
      props.children == null,
      'Can only set one of `children` or `props.dangerouslySetInnerHTML`.'
    );
    invariant(
      typeof props.dangerouslySetInnerHTML === 'object' &&
      HTML in props.dangerouslySetInnerHTML,
      '`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. ' +
      'Please visit https://fb.me/react-invariant-dangerously-set-inner-html ' +
      'for more information.'
    );
  }
  if (__DEV__) {
    warning(
      props.innerHTML == null,
      'Directly setting property `innerHTML` is not permitted. ' +
      'For more information, lookup documentation on `dangerouslySetInnerHTML`.'
    );
    warning(
      props.suppressContentEditableWarning ||
      !props.contentEditable ||
      props.children == null,
      'A component is `contentEditable` and contains `children` managed by ' +
      'React. It is now your responsibility to guarantee that none of ' +
      'those nodes are unexpectedly modified or duplicated. This is ' +
      'probably not intentional.'
    );
    warning(
      props.onFocusIn == null &&
      props.onFocusOut == null,
      'React uses onFocus and onBlur instead of onFocusIn and onFocusOut. ' +
      'All React events are normalized to bubble, so onFocusIn and onFocusOut ' +
      'are not needed/supported by React.'
    );
  }
  invariant(
    props.style == null || typeof props.style === 'object',
    'The `style` prop expects a mapping from style properties to values, ' +
    'not a string. For example, style={{marginRight: spacing + \'em\'}} when ' +
    'using JSX.%s',
     getDeclarationErrorAddendum()
  );
}

function ensureListeningTo(rootContainerElement, registrationName) {
  if (__DEV__) {
    // IE8 has no API for event capturing and the `onScroll` event doesn't
    // bubble.
    warning(
      registrationName !== 'onScroll' || isEventSupported('scroll', true),
      'This browser doesn\'t support the `onScroll` event'
    );
  }
  var isDocumentFragment = rootContainerElement.nodeType === DOC_FRAGMENT_TYPE;
  var doc = isDocumentFragment ? rootContainerElement : rootContainerElement.ownerDocument;
  listenTo(registrationName, doc);
}

// There are so many media events, it makes sense to just
// maintain a list rather than create a `trapBubbledEvent` for each
var mediaEvents = {
  topAbort: 'abort',
  topCanPlay: 'canplay',
  topCanPlayThrough: 'canplaythrough',
  topDurationChange: 'durationchange',
  topEmptied: 'emptied',
  topEncrypted: 'encrypted',
  topEnded: 'ended',
  topError: 'error',
  topLoadedData: 'loadeddata',
  topLoadedMetadata: 'loadedmetadata',
  topLoadStart: 'loadstart',
  topPause: 'pause',
  topPlay: 'play',
  topPlaying: 'playing',
  topProgress: 'progress',
  topRateChange: 'ratechange',
  topSeeked: 'seeked',
  topSeeking: 'seeking',
  topStalled: 'stalled',
  topSuspend: 'suspend',
  topTimeUpdate: 'timeupdate',
  topVolumeChange: 'volumechange',
  topWaiting: 'waiting',
};

function trapClickOnNonInteractiveElement(node : HTMLElement) {
  // Mobile Safari does not fire properly bubble click events on
  // non-interactive elements, which means delegated click listeners do not
  // fire. The workaround for this bug involves attaching an empty click
  // listener on the target node.
  // http://www.quirksmode.org/blog/archives/2010/09/click_event_del.html
  // Just set it using the onclick property so that we don't have to manage any
  // bookkeeping for it. Not sure if we need to clear it when the listener is
  // removed.
  // TODO: Only do this for the relevant Safaris maybe?
  node.onclick = emptyFunction;
}

function trapBubbledEventsLocal(node : Element, tag : string) {
  // If a component renders to null or if another component fatals and causes
  // the state of the tree to be corrupted, `node` here can be null.

  // TODO: Make sure that we check isMounted before firing any of these events.
  // TODO: Inline these below since we're calling this from an equivalent
  // switch statement.
  switch (tag) {
    case 'iframe':
    case 'object':
      ReactBrowserEventEmitter.trapBubbledEvent(
        'topLoad',
        'load',
        node
      );
      break;
    case 'video':
    case 'audio':
      // Create listener for each media event
      for (var event in mediaEvents) {
        if (mediaEvents.hasOwnProperty(event)) {
          ReactBrowserEventEmitter.trapBubbledEvent(
            event,
            mediaEvents[event],
            node
          );
        }
      }
      break;
    case 'source':
      ReactBrowserEventEmitter.trapBubbledEvent(
        'topError',
        'error',
        node
      );
      break;
    case 'img':
      ReactBrowserEventEmitter.trapBubbledEvent(
        'topError',
        'error',
        node
      );
      ReactBrowserEventEmitter.trapBubbledEvent(
        'topLoad',
        'load',
        node
      );
      break;
    case 'form':
      ReactBrowserEventEmitter.trapBubbledEvent(
        'topReset',
        'reset',
        node
      );
      ReactBrowserEventEmitter.trapBubbledEvent(
        'topSubmit',
        'submit',
        node
      );
      break;
    case 'input':
    case 'select':
    case 'textarea':
      ReactBrowserEventEmitter.trapBubbledEvent(
        'topInvalid',
        'invalid',
        node
      );
      break;
  }
}

// For HTML, certain tags should omit their close tag. We keep a whitelist for
// those special-case tags.

var omittedCloseTags = {
  'area': true,
  'base': true,
  'br': true,
  'col': true,
  'embed': true,
  'hr': true,
  'img': true,
  'input': true,
  'keygen': true,
  'link': true,
  'meta': true,
  'param': true,
  'source': true,
  'track': true,
  'wbr': true,
  // NOTE: menuitem's close tag should be omitted, but that causes problems.
};

// For HTML, certain tags cannot have children. This has the same purpose as
// `omittedCloseTags` except that `menuitem` should still have its closing tag.

var voidElementTags = {
  'menuitem': true,
  ...omittedCloseTags,
};

// We accept any tag to be rendered but since this gets injected into arbitrary
// HTML, we want to make sure that it's a safe tag.
// http://www.w3.org/TR/REC-xml/#NT-Name

var VALID_TAG_REGEX = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/; // Simplified subset
var validatedTagCache = {};
var hasOwnProperty = {}.hasOwnProperty;

function validateDangerousTag(tag) {
  if (!hasOwnProperty.call(validatedTagCache, tag)) {
    invariant(VALID_TAG_REGEX.test(tag), 'Invalid tag: %s', tag);
    validatedTagCache[tag] = true;
  }
}

function isCustomComponent(tagName, props) {
  return tagName.indexOf('-') >= 0 || props.is != null;
}

/**
 * Reconciles the properties by detecting differences in property values and
 * updating the DOM as necessary. This function is probably the single most
 * critical path for performance optimization.
 *
 * TODO: Benchmark whether checking for changed values in memory actually
 *       improves performance (especially statically positioned elements).
 * TODO: Benchmark the effects of putting this at the top since 99% of props
 *       do not change for a given reconciliation.
 * TODO: Benchmark areas that can be improved with caching.
 */
function updateDOMProperties(
  domElement : Element,
  rootContainerElement : Element,
  lastProps : null | Object,
  nextProps : Object,
  wasCustomComponentTag : boolean,
  isCustomComponentTag : boolean,
) : void {
  var propKey;
  var styleName;
  var styleUpdates;
  for (propKey in lastProps) {
    if (nextProps.hasOwnProperty(propKey) ||
       !lastProps.hasOwnProperty(propKey) ||
       lastProps[propKey] == null) {
      continue;
    }
    if (propKey === STYLE) {
      var lastStyle = lastProps[propKey];
      for (styleName in lastStyle) {
        if (lastStyle.hasOwnProperty(styleName)) {
          styleUpdates = styleUpdates || {};
          styleUpdates[styleName] = '';
        }
      }
    } else if (propKey === DANGEROUSLY_SET_INNER_HTML ||
               propKey === CHILDREN) {
      // TODO: Clear innerHTML. This is currently broken in Fiber because we are
      // too late to clear everything at this point because new children have
      // already been inserted.
    } else if (propKey === SUPPRESS_CONTENT_EDITABLE_WARNING) {
      // Noop
    } else if (registrationNameModules.hasOwnProperty(propKey)) {
      // Do nothing for deleted listeners.
    } else if (wasCustomComponentTag) {
      DOMPropertyOperations.deleteValueForAttribute(
        domElement,
        propKey
      );
    } else if (
        DOMProperty.properties[propKey] ||
        DOMProperty.isCustomAttribute(propKey)) {
      DOMPropertyOperations.deleteValueForProperty(domElement, propKey);
    }
  }
  for (propKey in nextProps) {
    var nextProp = nextProps[propKey];
    var lastProp =
      lastProps != null ? lastProps[propKey] : undefined;
    if (!nextProps.hasOwnProperty(propKey) ||
        nextProp === lastProp ||
        nextProp == null && lastProp == null) {
      continue;
    }
    if (propKey === STYLE) {
      if (__DEV__) {
        if (nextProp) {
          // Freeze the next style object so that we can assume it won't be
          // mutated. We have already warned for this in the past.
          Object.freeze(nextProp);
        }
      }
      if (lastProp) {
        // Unset styles on `lastProp` but not on `nextProp`.
        for (styleName in lastProp) {
          if (lastProp.hasOwnProperty(styleName) &&
              (!nextProp || !nextProp.hasOwnProperty(styleName))) {
            styleUpdates = styleUpdates || {};
            styleUpdates[styleName] = '';
          }
        }
        // 2 styles that changed since `lastProp`.
        for (styleName in nextProp) {
          if (nextProp.hasOwnProperty(styleName) &&
              lastProp[styleName] !== nextProp[styleName]) {
            styleUpdates = styleUpdates || {};
            styleUpdates[styleName] = nextProp[styleName];
          }
        }
      } else {
        // Relies on `updateStylesByID` not mutating `styleUpdates`.
        styleUpdates = nextProp;
      }
    } else if (propKey === DANGEROUSLY_SET_INNER_HTML) {
      var nextHtml = nextProp ? nextProp[HTML] : undefined;
      var lastHtml = lastProp ? lastProp[HTML] : undefined;
      if (nextHtml) {
        if (lastHtml) {
          if (lastHtml !== nextHtml) {
            setInnerHTML(domElement, '' + nextHtml);
          }
        } else {
          setInnerHTML(domElement, nextHtml);
        }
      } else {
        // TODO: It might be too late to clear this if we have children
        // inserted already.
      }
    } else if (propKey === CHILDREN) {
      if (typeof nextProp === 'string') {
        setTextContent(domElement, nextProp);
      } else if (typeof nextProp === 'number') {
        setTextContent(domElement, '' + nextProp);
      }
    } else if (propKey === SUPPRESS_CONTENT_EDITABLE_WARNING) {
      // Noop
    } else if (registrationNameModules.hasOwnProperty(propKey)) {
      if (nextProp) {
        ensureListeningTo(rootContainerElement, propKey);
      }
    } else if (isCustomComponentTag) {
      DOMPropertyOperations.setValueForAttribute(
        domElement,
        propKey,
        nextProp
      );
    } else if (
        DOMProperty.properties[propKey] ||
        DOMProperty.isCustomAttribute(propKey)) {
      // If we're updating to null or undefined, we should remove the property
      // from the DOM node instead of inadvertently setting to a string. This
      // brings us in line with the same behavior we have on initial render.
      if (nextProp != null) {
        DOMPropertyOperations.setValueForProperty(domElement, propKey, nextProp);
      } else {
        DOMPropertyOperations.deleteValueForProperty(domElement, propKey);
      }
    }
  }
  if (styleUpdates) {
    var componentPlaceholder = null;
    if (__DEV__) {
      // HACK
      var internalInstance = ReactDOMComponentTree.getInstanceFromNode(domElement);
      componentPlaceholder = {
        _currentElement: { type: internalInstance.type, props: internalInstance.memoizedProps },
        _debugID: internalInstance._debugID,
      };
    }
    CSSPropertyOperations.setValueForStyles(
      domElement,
      styleUpdates,
      componentPlaceholder // TODO: Change CSSPropertyOperations to use getCurrentOwnerName.
    );
  }
}

// Assumes there is no parent namespace.
function getIntrinsicNamespace(type : string) : string | null {
  switch (type) {
    case 'svg':
      return SVG_NAMESPACE;
    case 'math':
      return MATH_NAMESPACE;
    default:
      return null;
  }
}


  function getChildNamespace(parentNamespace : string | null, type : string) : string | null {
    if (parentNamespace == null) {
      // No parent namespace: potential entry point.
      return getIntrinsicNamespace(type);
    }
    if (parentNamespace === SVG_NAMESPACE && type === 'foreignObject') {
      // We're leaving SVG.
      return null;
    }
    // By default, pass namespace below.
    return parentNamespace;
  }

  function createElement(
    type : string,
    props : Object,
    rootContainerElement : Element,
    parentNamespace : string | null
  ) : Element {
    validateDangerousTag(type);
    // TODO:
    // const tag = type.toLowerCase(); Do we need to apply lower case only on non-custom elements?

    // We create tags in the namespace of their parent container, except HTML
    // tags get no namespace.
    var ownerDocument = rootContainerElement.ownerDocument;
    var domElement : Element;
    var namespaceURI = parentNamespace || getIntrinsicNamespace(type);
    if (namespaceURI == null) {
      const tag = type.toLowerCase();
      if (tag === 'script') {
        // Create the script via .innerHTML so its "parser-inserted" flag is
        // set to true and it does not execute
        var div = ownerDocument.createElement('div');
        div.innerHTML = '<script></script>';
        // This is guaranteed to yield a script element.
        var firstChild = ((div.firstChild : any) : HTMLScriptElement);
        domElement = div.removeChild(firstChild);
      } else if (props.is) {
        domElement = ownerDocument.createElement(type, props.is);
      } else {
        // Separate else branch instead of using `props.is || undefined` above becuase of a Firefox bug.
        // See discussion in https://github.com/facebook/react/pull/6896
        // and discussion in https://bugzilla.mozilla.org/show_bug.cgi?id=1276240
        domElement = ownerDocument.createElement(type);
      }
    } else {
      domElement = ownerDocument.createElementNS(
        namespaceURI,
        type
      );
    }

    return domElement;
  }

  function setInitialProperties(
    domElement : Element,
    tag : string,
    rawProps : Object,
    rootContainerElement : Element
  ) : void {

    var isCustomComponentTag = isCustomComponent(tag, rawProps);
    if (__DEV__) {
      if (isCustomComponentTag && !didWarnShadyDOM && domElement.shadyRoot) {
        warning(
          false,
          '%s is using shady DOM. Using shady DOM with React can ' +
          'cause things to break subtly.',
          getCurrentOwnerName() || 'A component'
        );
        didWarnShadyDOM = true;
      }
    }

    var props : Object;
    switch (tag) {
      case 'audio':
      case 'form':
      case 'iframe':
      case 'img':
      case 'link':
      case 'object':
      case 'source':
      case 'video':
        trapBubbledEventsLocal(domElement, tag);
        props = rawProps;
        break;
      case 'input':
        ReactDOMFiberInput.mountWrapper(domElement, rawProps);
        props = ReactDOMFiberInput.getHostProps(domElement, rawProps);
        trapBubbledEventsLocal(domElement, tag);
        // For controlled components we always need to ensure we're listening
        // to onChange. Even if there is no listener.
        ensureListeningTo(rootContainerElement, 'onChange');
        break;
      case 'option':
        ReactDOMFiberOption.mountWrapper(domElement, rawProps);
        props = ReactDOMFiberOption.getHostProps(domElement, rawProps);
        break;
      case 'select':
        ReactDOMFiberSelect.mountWrapper(domElement, rawProps);
        props = ReactDOMFiberSelect.getHostProps(domElement, rawProps);
        trapBubbledEventsLocal(domElement, tag);
        // For controlled components we always need to ensure we're listening
        // to onChange. Even if there is no listener.
        ensureListeningTo(rootContainerElement, 'onChange');
        break;
      case 'textarea':
        ReactDOMFiberTextarea.mountWrapper(domElement, rawProps);
        props = ReactDOMFiberTextarea.getHostProps(domElement, rawProps);
        trapBubbledEventsLocal(domElement, tag);
        // For controlled components we always need to ensure we're listening
        // to onChange. Even if there is no listener.
        ensureListeningTo(rootContainerElement, 'onChange');
        break;
      default:
        props = rawProps;
    }

    assertValidProps(tag, props);

    updateDOMProperties(
      domElement,
      rootContainerElement,
      null,
      props,
      false,
      isCustomComponentTag
    );

    // TODO: All these autoFocus won't work because the component is not in the
    // DOM yet. We need a special effect to handle this.
    switch (tag) {
      case 'input':
        // TODO: Make sure we check if this is still unmounted or do any clean
        // up necessary since we never stop tracking anymore.
        inputValueTracking.trackNode((domElement : any));
        ReactDOMFiberInput.postMountWrapper(domElement, rawProps);
        if (props.autoFocus) {
          focusNode(domElement);
        }
        break;
      case 'textarea':
        // TODO: Make sure we check if this is still unmounted or do any clean
        // up necessary since we never stop tracking anymore.
        inputValueTracking.trackNode((domElement : any));
        ReactDOMFiberTextarea.postMountWrapper(domElement, rawProps);
        if (props.autoFocus) {
          focusNode(domElement);
        }
        break;
      case 'select':
        if (props.autoFocus) {
          focusNode(domElement);
        }
        break;
      case 'button':
        if (props.autoFocus) {
          focusNode(domElement);
        }
        break;
      case 'option':
        ReactDOMFiberOption.postMountWrapper(domElement, rawProps);
        break;
      default:
        if (typeof props.onClick === 'function') {
          // TODO: This cast may not be sound for SVG, MathML or custom elements.
          trapClickOnNonInteractiveElement(((domElement : any) : HTMLElement));
        }
        break;
    }
  }

  function updateProperties(
    domElement : Element,
    tag : string,
    lastRawProps : Object,
    nextRawProps : Object,
    rootContainerElement : Element
  ) : void {
    var lastProps : Object;
    var nextProps : Object;
    switch (tag) {
      case 'input':
        lastProps = ReactDOMFiberInput.getHostProps(domElement, lastRawProps);
        nextProps = ReactDOMFiberInput.getHostProps(domElement, nextRawProps);
        break;
      case 'option':
        lastProps = ReactDOMFiberOption.getHostProps(domElement, lastRawProps);
        nextProps = ReactDOMFiberOption.getHostProps(domElement, nextRawProps);
        break;
      case 'select':
        lastProps = ReactDOMFiberSelect.getHostProps(domElement, lastRawProps);
        nextProps = ReactDOMFiberSelect.getHostProps(domElement, nextRawProps);
        break;
      case 'textarea':
        lastProps = ReactDOMFiberTextarea.getHostProps(domElement, lastRawProps);
        nextProps = ReactDOMFiberTextarea.getHostProps(domElement, nextRawProps);
        break;
      default:
        lastProps = lastRawProps;
        nextProps = nextRawProps;
        if (typeof lastProps.onClick !== 'function' &&
            typeof nextProps.onClick === 'function') {
          // TODO: This cast may not be sound for SVG, MathML or custom elements.
          trapClickOnNonInteractiveElement(((domElement : any) : HTMLElement));
        }
        break;
    }

    assertValidProps(tag, nextProps);
    var wasCustomComponentTag = isCustomComponent(tag, lastProps);
    var isCustomComponentTag = isCustomComponent(tag, nextProps);
    updateDOMProperties(
      domElement,
      rootContainerElement,
      lastProps,
      nextProps,
      wasCustomComponentTag,
      isCustomComponentTag
    );

    switch (tag) {
      case 'input':
        // 2 the wrapper around inputs *after* updating props. This has to
        // happen after `updateDOMProperties`. Otherwise HTML5 input validations
        // raise warnings and prevent the new value from being assigned.
        ReactDOMFiberInput.updateWrapper(domElement, nextRawProps);
        break;
      case 'textarea':
        ReactDOMFiberTextarea.updateWrapper(domElement, nextRawProps);
        break;
      case 'select':
        // <select> value update needs to occur after <option> children
        // reconciliation
        ReactDOMFiberSelect.postUpdateWrapper(domElement, nextRawProps);
        break;
    }
  }

  function restoreControlledState(domElement : Element, tag : string, props : Object) : void {
    switch (tag) {
      case 'input':
        ReactDOMFiberInput.restoreControlledState(domElement, props);
        return;
      case 'textarea':
        ReactDOMFiberTextarea.restoreControlledState(domElement, props);
        return;
      case 'select':
        ReactDOMFiberSelect.restoreControlledState(domElement, props);
        return;
    }
  }



// DOM host config

const DOCUMENT_NODE = 9;

ReactDOMInjection.inject();
ReactControlledComponent.injection.injectFiberControlledHostComponent(
  {restoreControlledState}
);
findDOMNode._injectFiber(function(fiber: Fiber) {
  return findHostInstance(fiber);
});

type DOMContainerElement = Element & { _reactRootContainer: ?Object };

type Container = Element;
type Props = { className ?: string };
type Instance = Element;
type TextInstance = Text;

let eventsEnabled : ?boolean = null;
let selectionInformation : ?mixed = null;


  function  getChildHostContext(parentHostContext : string | null, type : string) {
    const parentNamespace = parentHostContext;
    return getChildNamespace(parentNamespace, type);
  }

  function prepareForCommit() : void {
    eventsEnabled = ReactBrowserEventEmitter.isEnabled();
    ReactBrowserEventEmitter.setEnabled(false);
    selectionInformation = ReactInputSelection.getSelectionInformation();
  }

  function resetAfterCommit() : void {
    ReactInputSelection.restoreSelection(selectionInformation);
    selectionInformation = null;
    ReactBrowserEventEmitter.setEnabled(eventsEnabled);
    eventsEnabled = null;
  }

  function createInstance(
    type : string,
    props : Props,
    rootContainerInstance : Container,
    hostContext : string | null,
    internalInstanceHandle : Object,
  ) : Instance {
    const domElement : Instance = createElement(type, props, rootContainerInstance, hostContext);
    precacheFiberNode(internalInstanceHandle, domElement);
    return domElement;
  }

  function appendInitialChild(parentInstance : Instance, child : Instance | TextInstance) : void {
    parentInstance.appendChild(child);
  }

  function finalizeInitialChildren(
    domElement : Instance,
    props : Props,
    rootContainerInstance : Container,
  ) : void {
    // TODO: we normalize here because DOM renderer expects tag to be lowercase.
    // We can change DOM renderer to compare special case against upper case,
    // and use tagName (which is upper case for HTML DOM elements). Or we could
    // let the renderer "normalize" the fiber type so we don't have to read
    // the type from DOM. However we need to remember SVG is case-sensitive.
    var tag = domElement.tagName.toLowerCase();
    setInitialProperties(domElement, tag, props, rootContainerInstance);
  }

  function prepareUpdate(
    domElement : Instance,
    oldProps : Props,
    newProps : Props
  ) : boolean {
    return true;
  }

  function commitUpdate(
    domElement : Instance,
    oldProps : Props,
    newProps : Props,
    rootContainerInstance : Container,
    internalInstanceHandle : Object,
  ) : void {
    // TODO: we normalize here because DOM renderer expects tag to be lowercase.
    // We can change DOM renderer to compare special case against upper case,
    // and use tagName (which is upper case for HTML DOM elements). Or we could
    // let the renderer "normalize" the fiber type so we don't have to read
    // the type from DOM. However we need to remember SVG is case-sensitive.
    var tag = domElement.tagName.toLowerCase();
    // 2 the internal instance handle so that we know which props are
    // the current ones.
    precacheFiberNode(internalInstanceHandle, domElement);
    updateProperties(domElement, tag, oldProps, newProps, rootContainerInstance);
  }

  function shouldSetTextContent(props : Props) : boolean {
    return (
      typeof props.children === 'string' ||
      typeof props.children === 'number' ||
      (
        typeof props.dangerouslySetInnerHTML === 'object' &&
        props.dangerouslySetInnerHTML !== null &&
        typeof props.dangerouslySetInnerHTML.__html === 'string'
      )
    );
  }

  function resetTextContent(domElement : Instance) : void {
    domElement.textContent = '';
  }

  function createTextInstance(text : string, internalInstanceHandle : Object) : TextInstance {
    var textNode : TextInstance = document.createTextNode(text);
    precacheFiberNode(internalInstanceHandle, textNode);
    return textNode;
  }

  function commitTextUpdate(textInstance : TextInstance, oldText : string, newText : string) : void {
    textInstance.nodeValue = newText;
  }

  function appendChild(parentInstance : Instance | Container, child : Instance | TextInstance) : void {
    parentInstance.appendChild(child);
  }

  function insertBefore(
    parentInstance : Instance | Container,
    child : Instance | TextInstance,
    beforeChild : Instance | TextInstance
  ) : void {
    parentInstance.insertBefore(child, beforeChild);
  }

  function removeChild(parentInstance : Instance | Container, child : Instance | TextInstance) : void {
    parentInstance.removeChild(child);
  }

  var hostScheduleAnimationCallback = window.requestAnimationFrame;

  var hostScheduleDeferredCallback = window.requestIdleCallback;



ReactGenericBatching.injection.injectFiberBatchedUpdates(batchedUpdates);

var warned = false;

function warnAboutUnstableUse() {
  // Ignore this warning is the feature flag is turned on. E.g. for tests.
  warning(
    warned || ReactDOMFeatureFlags.useFiber,
    'You are using React DOM Fiber which is an experimental renderer. ' +
    'It is likely to have bugs, breaking changes and is unsupported.'
  );
  warned = true;
}

function renderSubtreeIntoContainer(parentComponent : ?ReactComponent<any, any, any>, element : ReactElement<any>, containerNode : DOMContainerElement | Document, callback: ?Function) {
  let container : DOMContainerElement =
    containerNode.nodeType === DOCUMENT_NODE ? (containerNode : any).documentElement : (containerNode : any);
  let root;
  if (!container._reactRootContainer) {
    // First clear any existing content.
    while (container.lastChild) {
      container.removeChild(container.lastChild);
    }
    root = container._reactRootContainer = mountContainer(element, container, parentComponent, callback);
  } else {
    updateContainer(element, root = container._reactRootContainer, parentComponent, callback);
  }
  return getPublicRootInstance(root);
}

var ReactDOM = {

  render(element : ReactElement<any>, container : DOMContainerElement, callback: ?Function) {
    warnAboutUnstableUse();
    return renderSubtreeIntoContainer(null, element, container, callback);
  },

  unstable_renderSubtreeIntoContainer(parentComponent : ReactComponent<any, any, any>, element : ReactElement<any>, containerNode : DOMContainerElement | Document, callback: ?Function) {
    invariant(
      parentComponent != null && ReactInstanceMap.has(parentComponent),
      'parentComponent must be a valid React Component'
    );
    return renderSubtreeIntoContainer(parentComponent, element, containerNode, callback);
  },

  unmountComponentAtNode(container : DOMContainerElement) {
    warnAboutUnstableUse();
    const root = container._reactRootContainer;
    if (root) {
      // TODO: Is it safe to reset this now or should I wait since this
      // unmount could be deferred?
      container._reactRootContainer = null;
      unmountContainer(root);
    }
  },

  findDOMNode: findDOMNode,

  unstable_createPortal(children: ReactNodeList, container : DOMContainerElement, key : ?string = null) {
    // TODO: pass ReactDOM portal implementation as third argument
    return ReactPortal.createPortal(children, container, null, key);
  },

  unstable_batchedUpdates: ReactGenericBatching.batchedUpdates,

};

module.exports = ReactDOM;
