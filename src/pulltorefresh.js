/* eslint-disable import/no-unresolved */

import _ptrMarkup from './_markup.pug';
import _ptrStyles from './_styles.less';

let _SETTINGS = {};

const _defaults = {
  distThreshold: 60,
  distMax: 80,
  distReload: 50,
  bodyOffset: 20,
  mainElement: 'body',
  triggerElement: 'body',
  ptrElement: '.ptr',
  classPrefix: 'ptr--',
  cssProp: 'min-height',
  iconArrow: '&#8675;',
  iconRefreshing: '&hellip;',
  instructionsPullToRefresh: 'Pull down to refresh',
  instructionsReleaseToRefresh: 'Release to refresh',
  instructionsRefreshing: 'Refreshing',
  refreshTimeout: 500,
  getMarkup: _ptrMarkup,
  getStyles: _ptrStyles,
  onInit: () => {},
  onRefresh: () => location.reload(),
  resistanceFunction: t => Math.min(1, t / 2.5),
  shouldPullToRefresh: () => !window.scrollY,
};

let pullStartY = null;
let pullMoveY = null;
let dist = 0;
let distResisted = 0;

let _state = 'pending';
let _setup = false;
let _enable = false;
let _timeout;

let supportsPassive = false;

try {
  window.addEventListener('test', null, {
    get passive() {
      supportsPassive = true;
    },
  });
} catch (e) {
  // do nothing
}

function _update() {
  const {
    classPrefix,
    ptrElement,
    iconArrow,
    iconRefreshing,
    instructionsRefreshing,
    instructionsPullToRefresh,
    instructionsReleaseToRefresh,
  } = _SETTINGS;

  const iconEl = ptrElement.querySelector(`.${classPrefix}icon`);
  const textEl = ptrElement.querySelector(`.${classPrefix}text`);

  if (_state === 'refreshing') {
    iconEl.innerHTML = iconRefreshing;
  } else {
    iconEl.innerHTML = iconArrow;
  }

  if (_state === 'releasing') {
    textEl.innerHTML = instructionsReleaseToRefresh;
  }

  if (_state === 'pulling' || _state === 'pending') {
    textEl.innerHTML = instructionsPullToRefresh;
  }

  if (_state === 'refreshing') {
    textEl.innerHTML = instructionsRefreshing;
  }
}

function _setupEvents() {
  function onReset() {
    const { cssProp, ptrElement, classPrefix } = _SETTINGS;

    ptrElement.classList.remove(`${classPrefix}refresh`);
    ptrElement.style[cssProp] = '0px';

    _state = 'pending';
  }

  function _onTouchStart(e) {
    const { shouldPullToRefresh, triggerElement } = _SETTINGS;

    if (shouldPullToRefresh()) {
      pullStartY = e.touches[0].screenY;
    }

    if (_state !== 'pending') {
      return;
    }

    clearTimeout(_timeout);

    _enable = triggerElement.contains(e.target);
    _state = 'pending';
    _update();
  }

  function _onTouchMove(e) {
    const {
      cssProp, classPrefix, distMax, distThreshold, ptrElement, resistanceFunction,
      shouldPullToRefresh,
    } = _SETTINGS;

    if (!pullStartY) {
      if (shouldPullToRefresh()) {
        pullStartY = e.touches[0].screenY;
      }
    } else {
      pullMoveY = e.touches[0].screenY;
    }

    if (!_enable || _state === 'refreshing') {
      if (shouldPullToRefresh() && pullStartY < pullMoveY) {
        e.preventDefault();
      }

      return;
    }

    if (_state === 'pending') {
      ptrElement.classList.add(`${classPrefix}pull`);
      _state = 'pulling';
      _update();
    }

    if (pullStartY && pullMoveY) {
      dist = pullMoveY - pullStartY;
    }

    if (dist > 0) {
      e.preventDefault();

      ptrElement.style[cssProp] = `${distResisted}px`;

      distResisted = resistanceFunction(dist / distThreshold)
        * Math.min(distMax, dist);

      if (_state === 'pulling' && distResisted > distThreshold) {
        ptrElement.classList.add(`${classPrefix}release`);
        _state = 'releasing';
        _update();
      }

      if (_state === 'releasing' && distResisted < distThreshold) {
        ptrElement.classList.remove(`${classPrefix}release`);
        _state = 'pulling';
        _update();
      }
    }
  }

  function _onTouchEnd() {
    const {
      ptrElement, onRefresh, refreshTimeout, distThreshold, distReload, cssProp, classPrefix,
    } = _SETTINGS;

    if (_state === 'releasing' && distResisted > distThreshold) {
      _state = 'refreshing';

      ptrElement.style[cssProp] = `${distReload}px`;
      ptrElement.classList.add(`${classPrefix}refresh`);

      _timeout = setTimeout(() => {
        const retval = onRefresh(onReset);

        if (retval && typeof retval.then === 'function') {
          retval.then(() => onReset());
        }

        if (!retval && !onRefresh.length) {
          onReset();
        }
      }, refreshTimeout);
    } else {
      if (_state === 'refreshing') {
        return;
      }

      ptrElement.style[cssProp] = '0px';

      _state = 'pending';
    }

    _update();

    ptrElement.classList.remove(`${classPrefix}release`);
    ptrElement.classList.remove(`${classPrefix}pull`);

    pullStartY = pullMoveY = null;
    dist = distResisted = 0;
  }

  function _onScroll() {
    const {
      mainElement, classPrefix, shouldPullToRefresh,
    } = _SETTINGS;

    mainElement.classList.toggle(`${classPrefix}top`, shouldPullToRefresh());
  }

  window.addEventListener('touchend', _onTouchEnd);
  window.addEventListener('touchstart', _onTouchStart);
  window.addEventListener('touchmove', _onTouchMove, supportsPassive
    ? { passive: _SETTINGS.passive || false }
    : undefined);

  window.addEventListener('scroll', _onScroll);

  // Store event handlers to use for teardown later
  return {
    onTouchStart: _onTouchStart,
    onTouchMove: _onTouchMove,
    onTouchEnd: _onTouchEnd,
    onScroll: _onScroll,
  };
}

function _run() {
  const {
    mainElement, getMarkup, getStyles, classPrefix, onInit,
  } = _SETTINGS;

  if (!document.querySelector(`.${classPrefix}ptr`)) {
    const ptr = document.createElement('div');

    if (mainElement !== document.body) {
      mainElement.parentNode.insertBefore(ptr, mainElement);
    } else {
      document.body.insertBefore(ptr, document.body.firstChild);
    }

    ptr.classList.add(`${classPrefix}ptr`);
    ptr.innerHTML = getMarkup()
      .replace(/__PREFIX__/g, classPrefix);

    _SETTINGS.ptrElement = ptr;
  }

  // Add the css styles to the style node, and then
  // insert it into the dom
  // ========================================================
  let styleEl;
  if (!document.querySelector('#pull-to-refresh-js-style')) {
    styleEl = document.createElement('style');
    styleEl.setAttribute('id', 'pull-to-refresh-js-style');

    document.head.appendChild(styleEl);
  } else {
    styleEl = document.querySelector('#pull-to-refresh-js-style');
  }

  styleEl.textContent = getStyles()
    .replace(/__PREFIX__/g, classPrefix)
    .replace(/\s+/g, ' ');

  if (typeof onInit === 'function') {
    onInit(_SETTINGS);
  }

  return {
    styleNode: styleEl,
    ptrElement: _SETTINGS.ptrElement,
  };
}

export default {
  init(options = {}) {
    let handlers;
    Object.keys(_defaults).forEach((key) => {
      _SETTINGS[key] = options[key] || _defaults[key];
    });

    const methods = ['mainElement', 'ptrElement', 'triggerElement'];
    methods.forEach((method) => {
      if (typeof _SETTINGS[method] === 'string') {
        _SETTINGS[method] = document.querySelector(_SETTINGS[method]);
      }
    });

    if (!_setup) {
      handlers = _setupEvents();
      _setup = true;
    }

    let { styleNode, ptrElement } = _run();

    return {
      destroy() {
        // Teardown event listeners
        window.removeEventListener('touchstart', handlers.onTouchStart);
        window.removeEventListener('touchend', handlers.onTouchEnd);
        window.removeEventListener('touchmove', handlers.onTouchMove, supportsPassive
          ? { passive: _SETTINGS.passive || false }
          : undefined);
        window.removeEventListener('scroll', handlers.onScroll);

        // Remove ptr element and style tag
        styleNode.parentNode.removeChild(styleNode);
        ptrElement.parentNode.removeChild(ptrElement);

        // Enable setupEvents to run again
        _setup = false;

        // null object references
        handlers = null;
        styleNode = null;
        ptrElement = null;
        _SETTINGS = {};
      },
    };
  },
};
