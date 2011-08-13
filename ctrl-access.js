var preferences = {
  "allow_uppercase": true,
  "allow_numbers": true,
  "optimize_for_dvorak": false
};

chrome.extension.sendRequest({method: "getLocalStoragePrefs"},
                             function(response) {
  preferences = JSON.parse(response.prefs);
});

function getPreferences() {
  return preferences;
}

var keycodes = {
  shift: 16,
  control: 17
};

function getAllowedKeys() {
  var prefs = getPreferences();
  // Ad-hoc reordering of the alphabet which moves "easy-to-type" keys to the
  // front. Keys that look similar have been removed (I, l and 1, 0 and O).
  var allKeys = prefs.optimize_for_dvorak ?
      "ueoahtnsidpgcrqjkwvmbxyfzUEAHTNSDPGCRLQJKVWMBXYFZ23456789".split("") :
      "fjdkeisawoghurcmnvtbyqzxpFJDKESLAWGHURCMNVTBYQZXP23456789".split("");
  if (!prefs.allow_uppercase) {
    allKeys = allKeys.filter(function(c) { return c == c.toLowerCase(); });
  }
  if (!prefs.allow_numbers) {
    allKeys = allKeys.filter(function(c) { return !/[0-9]/.check(c); });
  }
  return allKeys;
}

function simulateClick(el) {
  el.focus();
  var event = document.createEvent("MouseEvents");
  event.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false,
                       false, false, false, 0, null);
  el.dispatchEvent(event);
}

function isClickable(el) {
  return el.onclick ||
         el.onmousedown ||
         el.tagName == 'A' ||
         el.tagName == 'INPUT' ||
         el.tagName == 'TEXTAREA';
}

function computeCssProperty(el, prop) {
  var value = el.style[prop];
  if (!value || value == 'auto') {
    var css = document.defaultView.getComputedStyle(el, null);
    value = css ? css[prop] : null;
  }
  return value;
}

function computeAbsolutePosition(el) {
  var pos =  { x: el.offsetLeft, y: el.offsetTop };
  while (el.offsetParent) {
    el = el.offsetParent;
    if (computeCssProperty(el, 'position') == 'fixed') {
      pos.x += window.pageXOffset;
      pos.y += window.pageYOffset;
      break;
    }
    pos.x += el.offsetLeft;
    pos.y += el.offsetTop;
    if (el != document.body &&
        el != document.documentElement) {
      pos.x -= el.scrollLeft;
      pos.y -= el.scrollTop;
    }
  }
  return pos;
}

function isElementAtPosition(el, pos) {
  var xOffset = window.pageXOffset;
  var yOffset = window.pageYOffset;
  var elAtPosition = document.elementFromPoint(pos.x - xOffset,
                                               pos.y - yOffset);
  while (elAtPosition) {
    if (elAtPosition == el) return true;
    if (isClickable(elAtPosition)) return false;
    elAtPosition = elAtPosition.parentNode;
  }
  return false;
}


function inViewport(el, pos) {
  var width = el.offsetWidth;
  var height = el.offsetHeight;
  // Not sure if this is always correct, but in many cases it is.
  if (pos.x < 0 || pos.y < 0) return false;
  if (pos.x > window.pageXOffset + window.innerWidth) return false;
  if (pos.y > window.pageYOffset + window.innerHeight) return false;
  if (pos.x + width < window.pageXOffset) return false;
  if (pos.y + height < window.pageYOffset) return false;
  // Get element at point and verify that a click on this point would lead to
  // the expected element.
  // Note: if there is an intercepting element, then consider this element not
  // to be visible. (There should be a popup for the intercepting element
  // anyways.
  // For links that break over two lines just picking the middle point might not
  // be enough. we therefore try 4 other points.
  var centerPos = { x: pos.x + width / 2, y: pos.y + height / 2 };
  var leftTopPos = { x: pos.x + 1, y: pos.y + 1 };
  var rightTopPos = { x: pos.x + width - 1, y: pos.y + 1 };
  var leftBottomPos = { x: pos.x + 1, y: pos.y + height - 1 };
  var rightBottomPos = { x: pos.x + width - 1, y: pos.y + height - 1 };
  return isElementAtPosition(el, centerPos) ||
      isElementAtPosition(el, leftTopPos) ||
      isElementAtPosition(el, rightTopPos) ||
      isElementAtPosition(el, leftBottomPos) ||
      isElementAtPosition(el, rightBottomPos);
}

function normalizeChar(c) {
  // Hacky way of removing umlauts and accents...
  var map = { 'á': 'a', 'ä': 'a', 'à': 'a', 'â': 'a', 'å': 'a',
              'ó': 'o', 'ö': 'o', 'ò': 'o', 'ô': 'o',
              'é': 'e', 'ë': 'e', 'è': 'e', 'ê': 'e',
              'ú': 'u', 'ü': 'u', 'ù': 'u', 'û': 'u',
              'í': 'i', 'ï': 'i', 'ì': 'i', 'î': 'i',
              'ç': 'c', 'ß': 's', 'ñ': 'n' };
  return map[c] || c;
}

function computePreferredShortcuts(el) {
  // Simply mark characters that are after a space as preferred.
  // We might return a string that contains duplicate chars. Should not be a
  // problem.
  if (el.accessKey) return el.accessKey;
  var str = el.textContent;
  if (!str) { str = el.alt; }
  if (!str) { str = el.name; }
  if (!str) { str = el.id; }
  if (!str) return [];
  str = str.toLowerCase();
  var preferred = [];
  var nextIsPreferred = true;
  for (var i = 0; i < str.length; ++i) {
    if (str[i] == ' ') {
      nextIsPreferred = true;
      continue;
    }
    if (nextIsPreferred) {
      preferred.push(normalizeChar(str[i]));
    }
    nextIsPreferred = false;
  }
  // Simply append all characters. (Yields duplicates.)
  return preferred.concat(str.split("").map(normalizeChar));
}

var popups = [];
var shortcutMap = {};

function createAndShowPopup(el, shortcut) {
  var pos = computeAbsolutePosition(el);
  if (!inViewport(el, pos)) {
    // I have seen cases, where the link itself was size 0,0, but the child was
    // visible. So try at least one child, if that's the case.
    if ((el.offsetWidth == 0 || el.offsetHeight == 0) &&
        el.children.length > 0) {
      return createAndShowPopup(el.children[0], shortcut);
    }
    return false;
  }

  var div = document.createElement('div');
  var txt = document.createTextNode(shortcut);
  div.appendChild(txt);
  div.className = 'ctrl_access_popup';
  div.style.left = pos.x + "px";
  div.style.top = pos.y + "px";
  document.body.appendChild(div);
  popups.push(div);
  if (!(shortcut in shortcutMap)) { shortcutMap[shortcut] = el; }
  return true;
}

function showShortcuts() {
  var assignedShortcuts = {};  // A set of all assigned chars.
  var urlMap = {}; // A map from url to shortcut.

  // First get accessKeys that have been declared by the site.
  var allElements = document.getElementsByTagName("*");
  for (var i = 0; i < allElements.length; i++) {
    var el = allElements[i];
    if (!el.accessKey) continue;
    var el = allElements[i];
    assignedShortcuts[el.accessKey] = true;
    createAndShowPopup(el, el.accessKey);
    if (el.tagName == 'A') {
      var href = el.href;
      if (!(href in urlMap)) {
        urlMap[href] = el.accessKey
      }
    }
  }

  var allowedKeys = getAllowedKeys();

  // Now find all links, text-fields and buttons.
  for (var i = 0; i < allElements.length; ++i) {
    var el = allElements[i];
    if (el.accessKey) continue;

    if (el.nodeName == 'A') {
      if (el.href in urlMap) {
        createAndShowPopup(el, urlMap[el.href]);
        continue;
      }
    }
    if (isClickable(el)) {
      var preferred = computePreferredShortcuts(el).filter(function(c) {
        // Filter out the keys that are not allowed.
        return allowedKeys.some(function(c2) { return c == c2; });
      });
      // "possible" will probably have duplicated entries.
      var possible = preferred.concat(allowedKeys);
      var shortcut = false;
      for (var j = 0; j < possible.length; ++j) {
        var c = possible[j];
        if (c && !(c in assignedShortcuts)) {
          // We found a free character.
          shortcut = c;
          break;
        }
      }
      if (shortcut === false) {
        // Argh. no free character left.
        // No need to continue cycling through the other elements.
        break;
      }
      var isShown = createAndShowPopup(el, shortcut);
      if (!isShown) continue;
      assignedShortcuts[shortcut] = true;
      if (el.nodeName == 'A') {
        urlMap[el.href] = shortcut;
      }
    }
  }
}

function hideShortcuts() {
  for (var i = 0; i < popups.length; ++i) {
    document.body.removeChild(popups[i]);
  }
  popups = [];
  shortcutMap = {};
}

function findShortcutTarget(code, shift) {
  var key = String.fromCharCode(code);
  if (shift) {
    key = key.toUpperCase();
  } else {
    key = key.toLowerCase();
  }
  return shortcutMap[key];
}

function init() {
  var isShowingShortcuts = false;
  var isWaitingForCtrlUp = false;
  var justExecutedCtrlClick = false;

  function installEventListeners(rootNode) {
    var doc = rootNode.contentDocument || rootNode;
    var body = rootNode.body;

    if (!body || !body.addEventListener) {
      return;
    }

    body.addEventListener('keydown', function(ev) {
      justExecutedCtrlClick = false;
      var code = ev.keyCode;
      if (code == keycodes.control) {
        isWaitingForCtrlUp = true;
        return;
      }
      isWaitingForCtrlUp = false;
      if (!isShowingShortcuts) return;
      ev.stopPropagation();
      ev.preventDefault();
      if (code == keycodes.shift) return;
      var target = findShortcutTarget(ev.keyCode, ev.shiftKey);
      isShowingShortcuts = false;
      hideShortcuts();
      justExecutedCtrlClick = true;
      if (target) simulateClick(target);
    }, true);

    body.addEventListener('keyup', function(ev) {
      var code = ev.keyCode;
      if (code == keycodes.control) {
        if (isWaitingForCtrlUp) {
          if (isShowingShortcuts) {
            hideShortcuts();
          }
          isShowingShortcuts = !isShowingShortcuts;
          ev.stopPropagation();
          ev.preventDefault();
        }
        if (isShowingShortcuts) {
          showShortcuts();
        }
      } else {
        isWaitingForCtrlUp = false;
        if (justExecutedCtrlClick) {
          ev.stopPropagation();
          ev.preventDefault();
        }
      }
    }, true);

    var mouseHandler = function(ev) {
      if (isShowingShortcuts) {
        hideShortcuts();
      }
      isShowingShortcuts = false;
      isWaitingForCtrlUp = false;
    };

    body.addEventListener('mousedown', mouseHandler, false);
    body.addEventListener('mouseup', mouseHandler, false);
    body.addEventListener('onresize', mouseHandler, false);
  }

  var frames = document.getElementsByTagName('frame');
  var rootNodes = [document].concat(frames);
  for (var i = 0; i < rootNodes.length; ++i) {
    var rootNode = rootNodes[i];
    if (rootNode.contentDocument) {
      rootNode.addEventListener('load', function(ev) {
        installEventListeners(ev.target.contentDocument);
      });
    } else {
      installEventListeners(rootNode);
    }
  }
}

init();
