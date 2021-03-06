/* global _WORKLET _getCurrentTime _frameTimestamp _eventTimestamp, _setGlobalConsole */

import NativeReanimated from './NativeReanimated';
import { Platform } from 'react-native';
import { addWhitelistedNativeProps } from '../ConfigHelper';

global.__reanimatedWorkletInit = function(worklet) {
  worklet.__worklet = true;
};

// check if a worklet can be created successfully(in order to detect a lack of babel plugin)
if (
  !(() => {
    'worklet';
  }).__workletHash &&
  !process.env.JEST_WORKER_ID
) {
  throw new Error(
    "Reanimated 2 failed to create a worklet, maybe you forgot to add Reanimated's babel plugin?"
  );
}

function _toArrayReanimated(object) {
  'worklet';
  if (Array.isArray(object)) {
    return object;
  }
  if (
    typeof Symbol !== 'undefined' &&
    (typeof Symbol === 'function' ? Symbol.iterator : '@@iterator') in
      Object(object)
  )
    return Array.from(object);
  throw new 'Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.'();
}

function _mergeObjectsReanimated() {
  'worklet';
  return Object.assign.apply(null, arguments);
}

global.__reanimatedWorkletInit = function(worklet) {
  worklet.__worklet = true;

  if (worklet._closure) {
    const closure = worklet._closure;
    Object.keys(closure).forEach((key) => {
      if (key === '_toConsumableArray') {
        closure[key] = _toArrayReanimated;
      }

      if (key === '_objectSpread') {
        closure[key] = _mergeObjectsReanimated;
      }
    });
  }
};

function pushFrame(frame) {
  NativeReanimated.pushFrame(frame);
}

export function requestFrame(frame) {
  'worklet';
  if (NativeReanimated.native) {
    requestAnimationFrame(frame);
  } else {
    pushFrame(frame);
  }
}

global._WORKLET = false;
global._log = function(s) {
  console.log(s);
};

export function runOnUI(worklet) {
  return makeShareable(worklet);
}

export function makeShareable(value) {
  return NativeReanimated.makeShareable(value);
}

export function getViewProp(viewTag, propName) {
  return new Promise((resolve, reject) => {
    return NativeReanimated.getViewProp(viewTag, propName, (result) => {
      if (result.substr(0, 6) === 'error:') {
        reject(result);
      } else {
        resolve(result);
      }
    });
  });
}

function _getTimestamp() {
  'worklet';
  if (_frameTimestamp) {
    return _frameTimestamp;
  }
  if (_eventTimestamp) {
    return _eventTimestamp;
  }
  return _getCurrentTime();
}

export function getTimestamp() {
  'worklet';
  if (Platform.OS === 'web') {
    return NativeReanimated.getTimestamp();
  }
  return _getTimestamp();
}

function workletValueSetter(value) {
  'worklet';
  const previousAnimation = this._animation;
  if (previousAnimation) {
    previousAnimation.cancelled = true;
    this._animation = null;
  }
  if (
    typeof value === 'function' ||
    (value !== null && typeof value === 'object' && value.onFrame)
  ) {
    const animation = typeof value === 'function' ? value() : value;
    // prevent setting again to the same value
    // and triggering the mappers that treat this value as an input
    // this happens when the animation's target value(stored in animation.current until animation.onStart is called) is set to the same value as a current one(this._value)
    // built in animations that are not higher order(withTiming, withSpring) hold target value in .current
    if (this._value === animation.current && !animation.isHigherOrder) {
      return;
    }
    // animated set
    const initializeAnimation = (timestamp) => {
      animation.onStart(animation, this.value, timestamp, previousAnimation);
    };
    initializeAnimation(getTimestamp());
    const step = (timestamp) => {
      if (animation.cancelled) {
        animation.callback && animation.callback(false /* finished */);
        return;
      }
      const finished = animation.onFrame(animation, timestamp);
      animation.timestamp = timestamp;
      this._value = animation.current;
      if (finished) {
        animation.callback && animation.callback(true /* finished */);
      } else {
        requestAnimationFrame(step);
      }
    };

    this._animation = animation;

    if (_frameTimestamp) {
      // frame
      step(_frameTimestamp);
    } else {
      requestAnimationFrame(step);
    }
  } else {
    // prevent setting again to the same value
    // and triggering the mappers that treat this value as an input
    if (this._value === value) {
      return;
    }
    this._value = value;
  }
}

// We cannot use pushFrame
// so we use own implementation for js
function workletValueSetterJS(value) {
  const previousAnimation = this._animation;
  if (previousAnimation) {
    previousAnimation.cancelled = true;
    this._animation = null;
  }
  if (
    typeof value === 'function' ||
    (value !== null && typeof value === 'object' && value.onFrame)
  ) {
    // animated set
    const animation = typeof value === 'function' ? value() : value;
    let initializeAnimation = (timestamp) => {
      animation.onStart(animation, this.value, timestamp, previousAnimation);
    };
    const step = (timestamp) => {
      if (animation.cancelled) {
        animation.callback && animation.callback(false /* finished */);
        return;
      }
      if (initializeAnimation) {
        initializeAnimation(timestamp);
        initializeAnimation = null; // prevent closure from keeping ref to previous animation
      }
      const finished = animation.onFrame(animation, timestamp);
      animation.timestamp = timestamp;
      this._setValue(animation.current);
      if (finished) {
        animation.callback && animation.callback(true /* finished */);
      } else {
        requestFrame(step);
      }
    };

    this._animation = animation;

    requestFrame(step);
  } else {
    this._setValue(value);
  }
}

NativeReanimated.installCoreFunctions(
  NativeReanimated.native ? workletValueSetter : workletValueSetterJS
);

export function makeMutable(value) {
  return NativeReanimated.makeMutable(value);
}

export function makeRemote(object = {}) {
  return NativeReanimated.makeRemote(object);
}

export function startMapper(mapper, inputs = [], outputs = []) {
  return NativeReanimated.startMapper(mapper, inputs, outputs);
}

export function stopMapper(mapperId) {
  NativeReanimated.stopMapper(mapperId);
}

export const runOnJS = (fun) => {
  'worklet';
  if (!_WORKLET) {
    return fun;
  }
  if (!fun.__callAsync) {
    throw new Error(
      "Attempting to call runOnJS with an object that is not a host function. Using runOnJS is only possible with methods that are defined on the main React-Native Javascript thread and that aren't marked as worklets"
    );
  } else {
    return fun.__callAsync;
  }
};

export function createAnimatedPropAdapter(adapter, nativeProps) {
  const nativePropsToAdd = {};
  // eslint-disable-next-line no-unused-expressions
  nativeProps?.forEach((prop) => {
    nativePropsToAdd[prop] = true;
  });
  addWhitelistedNativeProps(nativePropsToAdd);
  return adapter;
}

const capturableConsole = console;
runOnUI(() => {
  'worklet';
  const console = {
    log: runOnJS(capturableConsole.log),
    warn: runOnJS(capturableConsole.warn),
    error: runOnJS(capturableConsole.error),
    info: runOnJS(capturableConsole.info),
  };
  _setGlobalConsole(console);
})();
