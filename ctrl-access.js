var preferences = {
  "shortcut_keys": "fjdkeisawoghurcmnvtbyqzxpFJDKESLAWGHURCMNVTBYQZXP23456789",
  "hardcoded": "",
  "only_one_char": true,
};

chrome.extension.sendRequest({method: "getLocalStoragePrefs"},
                             function(response) {
  preferences = JSON.parse(response.prefs);
});

function getPreferences() {
  return preferences;
}

var keycodes = {
  backspace: 8,
  shift: 16,
  control: 17
};

function getAllowedKeys() {
  var prefs = getPreferences();
  // Ad-hoc reordering of the alphabet which moves "easy-to-type" keys to the
  // front. Keys that look similar have been removed (I, l and 1, 0 and O).
  var pref_set = prefs.shortcut_keys.split("");
  var allKeys = [];
  // Remove duplicates.
  for (var i = 0; i < pref_set.length; i++) {
    var c = pref_set[i];
    if (allKeys.indexOf(c) == -1) allKeys.push(c);
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

function isElementOrChildInViewport(el) {
  var pos = computeAbsolutePosition(el);
  if (inViewport(el, pos)) return true;
  // I have seen cases, where the link itself was size 0,0, but the child was
  // visible. So try at least one child, if that's the case.
  if ((el.offsetWidth == 0 || el.offsetHeight == 0) &&
      el.children.length > 0) {
    return (inViewport(el.children[0],
                        computeAbsolutePosition(el.children[0])));
  }
  return false;
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

var shortcutMap = {};

function createAndShowPopup(el, shortcut) {
  var pos = computeAbsolutePosition(el);
  var div = document.createElement('div');
  div.style.left = pos.x + "px";
  div.style.top = pos.y + "px";
  document.body.appendChild(div);
  if (!(shortcut in shortcutMap)) {
    shortcutMap[shortcut] = { 'el': el, 'popups': [div] };
  } else {
    shortcutMap[shortcut].popups.push(div);
  }
}

function showShortcuts() {
  // Adds secquence + allowedKeys^remainingLength to keySequences.
  function addSequences(sequence, allowedKeys, remainingLength, keySequences) {
    if (remainingLength <= 0) {
      keySequences.push(sequence);
    } else {
      for (var i = 0; i < allowedKeys.length; i++) {
        addSequences(sequence + allowedKeys[i], allowedKeys,
                     remainingLength - 1, keySequences);
      }
    }
  }

  var assignedShortcuts = {};  // A set of all assigned chars.
  var urlMap = {}; // A map from url to shortcut.

  function assignAndShowShortcut(el, shortcut) {
    assignedShortcuts[shortcut] = true;
    createAndShowPopup(el, shortcut);
    if (el.tagName == 'A') {
      var href = el.href;
      if (!(href in urlMap)) {
        urlMap[href] = shortcut;
      }
    }
  }

  // I prefer working with real arrays.
  var tmp = document.getElementsByTagName("*");
  var allElements = [];
  for (var i = 0; i < tmp.length; i++) { allElements.push(tmp[i]); };

  // First get hardcoded refs.
  try {
    var hardcoded = new Function("return " + getPreferences().hardcoded)();
    var thisUrl = document.location.href;
    // Filter out the hardcoded patterns that are not for this page.
    var hardcoded = hardcoded.filter(function(pattern) {
      return pattern.url.test(thisUrl);
    });
    hardcoded.forEach(function(pattern) {
      if (pattern.id) {
        var el = document.getElementById(pattern.id);
        if (el) {
          if (pattern.shortcut) {
            assignAndShowShortcut(el, pattern.shortcut);
          }
          allElements[allElements.indexOf(el)] =
              allElements[allElements.length - 1];
          allElements.length--;
        }
      }
    });
  } catch(e) {
    // Just ignore any exceptions due to user input.
  }

  // Then get accessKeys that have been declared by the site.
  for (var i = 0; i < allElements.length; i++) {
    var el = allElements[i];
    if (!el.accessKey) continue;
    var el = allElements[i];
    assignAndShowShortcut(el, el.accessKey);
  }

  // visibleElements doesn't contain the elements with accessKeys anymore.
  var visibleElements = [];
  // We can't use the filter method, because allElements is not a JavaScript
  // array.
  for (var i = 0; i < allElements.length; i++) {
    var el = allElements[i];
    if (isClickable(el) && !el.accessKey && isElementOrChildInViewport(el)) {
      visibleElements.push(el);
    }
  }

  var visibleDistinctCount = 0;
  var distinctHrefs = {};
  for (var i = 0; i < visibleElements.length; i++) {
    var el = visibleElements[i];
    if (el.tagName == 'A') {
       if (el.href in distinctHrefs) continue;
       distinctHrefs[el.href] = true;
    }
    visibleDistinctCount++;
  }
  distinctHrefs = null;

  var allowedKeys = getAllowedKeys();
  var freeKeys = allowedKeys.filter(function(c) {
    return !(c in assignedShortcuts);
  });

  var sequenceLength = 1;
  var maxLength = getPreferences().only_one_char ? 1 : 3;
  var coveredPopus = freeKeys.length;
  while (sequenceLength < maxLength &&
         coveredPopus < visibleDistinctCount) {
    sequenceLength++;
    coveredPopus *= allowedKeys.length;
  }

  var keySequences;
  if (sequenceLength == 1) {
    keySequences = freeKeys.concat([]);
  } else {
    keySequences = [];
    for (var i = 0; i < freeKeys.length; i++) {
      var c = freeKeys[i];
      addSequences(c, allowedKeys, sequenceLength - 1, keySequences);
    }
  }
  var nextFree = 0;

  // Now find all links, text-fields and buttons.
  for (var i = 0; i < visibleElements.length; ++i) {
    var el = visibleElements[i];

    if (el.nodeName == 'A') {
      if (el.href in urlMap) {
        createAndShowPopup(el, urlMap[el.href]);
        continue;
      }
    }

    var shortcut = false;
    if (sequenceLength == 1) {
      var preferred = computePreferredShortcuts(el);
      for (var j = 0; j < preferred.length; j++) {
        var c = preferred[j];
        var index = keySequences.indexOf(c);
        if (index != -1) {
          shortcut = c;
          keySequences[index] = null;
          break;
        }
      }
    }
    if (!shortcut) {
      // Just pick the first free one.
      while (nextFree < keySequences.length &&
             keySequences[nextFree] == null) nextFree++;
      if (nextFree >= keySequences.length) {
        // No free sequence left. Don't continue cycling through the remaining
        // visible elements.
        break;
      }
      shortcut = keySequences[nextFree];
      // Clear the chosen keySequence so that the preferred search above doesn't
      // find it again.
      keySequences[nextFree++] = null;
    }
    assignAndShowShortcut(el, shortcut);
  }
  // Update classname and texts of popups.
  updatePopups("");
}

function hideShortcuts() {
  for (var shortcut in shortcutMap) {
    var popups = shortcutMap[shortcut].popups;
    for (var j = 0; j < popups.length; j++) {
      document.body.removeChild(popups[j]);
    }
  }
  shortcutMap = {};
}

function findShortcutTarget(sequence) {
  var shortcutInfo = shortcutMap[sequence];
  return shortcutInfo ? shortcutInfo.el : false;
}

function isShortcutPrefix(sequence) {
  for (var shortcut in shortcutMap) {
    if (shortcut.indexOf(sequence) == 0) return true;
  }
  return false;
}

function replaceWhitespace(str) {
  return str.replace(/ /g, "␣");
}

function updatePopups(sequence) {
  for (var shortcut in shortcutMap) {
    var popups = shortcutMap[shortcut].popups;
    var isActive = (shortcut.indexOf(sequence) == 0);
    popups.forEach(function(popup) {
      // Remove all children.
      while (popup.firstChild) popup.removeChild(popup.firstChild);
      // Set the correct className and text.
      if (isActive) {
        var boldSpan = document.createElement('b');
        var boldTxt = document.createTextNode(replaceWhitespace(sequence));
        boldSpan.appendChild(boldTxt);
        var unmatchedShortcut =
            replaceWhitespace(shortcut.substring(sequence.length));
        var unmatchedText = document.createTextNode(unmatchedShortcut);
        popup.appendChild(boldSpan);
        popup.appendChild(unmatchedText);
        popup.className = 'ctrl_access_popup';
      } else {
        var txt = document.createTextNode(replaceWhitespace(shortcut));
        popup.appendChild(txt);
        popup.className = 'ctrl_access_popup_inactive';
      }
    });
  }
}

function init() {
  var isShowingShortcuts = false;
  var isWaitingForCtrlUp = false;
  var consumeNextKeyUp = false;
  var sequence = "";

  function installEventListeners(rootNode) {
    var doc = rootNode.contentDocument || rootNode;
    var body = rootNode.body;

    if (!body || !body.addEventListener) {
      return;
    }

    body.addEventListener('keydown', function(ev) {
      consumeNextKeyUp = false;
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
      if (code == keycodes.backspace) {
        sequence = sequence.substring(0, sequence.length - 1);
      } else {
        var key = String.fromCharCode(ev.keyCode);
        if (ev.shiftKey) {
          sequence += key.toUpperCase();
        } else {
          sequence += key.toLowerCase();
        }
      }
      var target = findShortcutTarget(sequence);
      if (!target && isShortcutPrefix(sequence)) {
        updatePopups(sequence);
      } else {
        sequence = "";
        isShowingShortcuts = false;
        hideShortcuts();
      }
      consumeNextKeyUp = true;
      if (target) simulateClick(target);
    }, true);

    body.addEventListener('keyup', function(ev) {
      var code = ev.keyCode;
      if (code == keycodes.control) {
        if (isWaitingForCtrlUp) {
          if (isShowingShortcuts) {
            sequence = "";
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
        if (consumeNextKeyUp) {
          ev.stopPropagation();
          ev.preventDefault();
        }
      }
    }, true);

    var mouseHandler = function(ev) {
      if (isShowingShortcuts) {
        sequence = "";
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
