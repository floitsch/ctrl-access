/*
Copyright 2012 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Max time for key-down -> key-up of trigger key. Significantly reduces
// false positives.
var MAX_TRIGGER_DURATION = 200;

var keycodes = {
  backspace: 8,
  shift: 16,
  control: 17,
  alt: 18,
};

var preferences = {
  "trigger": keycodes.control,
  "trigger_newtab": keycodes.alt,
  "shortcut_keys": "fjdkeisawoghurcmnvtbyqzxpFJDKESLAWGHURCMNVTBYQZXP23456789",
  "hardcoded": "[]",
  "only_one_char": true,
  "newtab_only_when_triggered": false
};

var clickHandlerToken = ("_ctrlAccess" + Math.random()).replace(/\./, "");
var openInNewTab = false;

chrome.extension.sendRequest({method: "getLocalStoragePrefs"},
                             function(response) {
  if (response.prefs) {
    preferences = JSON.parse(response.prefs);
  }
});

function getPreferences() {
  return preferences;
}

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

function runningInMac() {
  return navigator.appVersion.indexOf("Mac") != -1;
}

function simulateClick(el) {
  el.focus();
  var event = document.createEvent("MouseEvents");
  var mod_keys = {
    "ctrl": false,
    "alt": false,
    "shift": false,
    "meta": false
  };
  if (openInNewTab) {
    if (runningInMac()) {
      mod_keys.meta = true;
    } else {
      mod_keys.ctrl = true;
    }
  }
  event.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0,
                       mod_keys.ctrl, mod_keys.alt, mod_keys.shift,
                       mod_keys.meta, 0, null);
  el.dispatchEvent(event);
}

function hasJavaScriptClickHandler(el) {
  return !!(el.onclick || el.onmousedown ||
            ((typeof el.getAttribute == 'function') &&
              (el.getAttribute("onclick") ||           // 'onclick' in html.
               el.getAttribute("onmousedown") ||       // 'onmousedown' in html.
               el.getAttribute(clickHandlerToken))));  // dymanically added clickhandler.
}

function isClickable(el) {
  return hasJavaScriptClickHandler(el) ||
         el.tagName == 'A' ||
         el.tagName == 'INPUT' ||
         el.tagName == 'BUTTON' ||
         el.tagName == 'TEXTAREA' ||
         typeof el.getAttribute == 'function' &&
             (el.getAttribute('role') == 'button' || el.getAttribute('role') == 'link');
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
  return {
    "x": $(el).offset().left,
    "y": $(el).offset().top
  };
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
  if (width === undefined || height === undefined) return false;
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
  var str = el.textContent || el.value || el.alt || el.name || el.id;
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
      preferred.push(str[i]);
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

  function removeFromArray(array, el) {
    removeFromArrayAt(array, array.indexOf(el));
  }

  function removeFromArrayAt(array, i) {
    array[i] = array[array.length - 1];
    array.length--;
  }

  var assignedShortcuts = {};  // A set of all assigned chars.
  var urlMap = {}; // A map from url to shortcut.

  function assignAndShowShortcut(el, shortcut) {
    assignedShortcuts[shortcut] = true;
    createAndShowPopup(el, shortcut);
    // JavaScript handlers can (and often do) changet the target of the link.
    if (hasJavaScriptClickHandler(el)) return;
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
          removeFromArray(allElements, el);
        }
      } else if (pattern.name) {
        var els = document.getElementsByName(pattern.name);
        if (pattern.shortcut) {
          // We only assign the shortcut to the first element.
          if (els.length > 0) {
            assignAndShowShortcut(els[0], pattern.shortcut);
            removeFromArray(allElements, els[0]);
          }
        } else {
          // But we remove all elements if the shortcut is the empty string.
          for (var i = 0; i < els.length; i++)
            removeFromArray(allElements, els[i]);
        }
      } else if (pattern.text) {
        function matchesText(el, text) {
          var str = el.textContent || el.value;
          return str === text;
        }

        if (!pattern.shortcut) {
          // Simply remove all elements that match the text.
          var i = 0;
          while (i < allElements.length) {
            if (matchesText(allElements[i], pattern.text)) {
              removeFromArrayAt(allElements[i]);
            } else {
              i++;
            }
          }
        } else {
          // We only look for the first matching element. Priority to clickable
          // elements.
          var foundElement = false;
          // First try elements that are clickable.
          for (var i = 0; i < allElements.length; i++) {
            var el = allElements[i];
            if (isClickable(el) && matchesText(el, pattern.text)) {
              foundElement = true;
              assignAndShowShortcut(el, pattern.shortcut);
              removeFromArrayAt(allElements, i);
            }
          }
          if (!foundElement) {
            // Now try non-clickable (at least according to our heuristic)
            // elements.
            for (var i = 0; i < allElements.length; i++) {
              var el = allElements[i];
              if (!isClickable(el) && matchesText(el, pattern.text)) {
                assignAndShowShortcut(el, pattern.shortcut);
                removeFromArrayAt(allElements, i);
              }
            }
          }
        }
      }
    });
  } catch(e) {
    // Just ignore any exceptions due to user input.
  }

  function isPrefixOrSuffixOfUsedShortcut(sequence) {
    for (var used in assignedShortcuts) {
      if (used.indexOf(sequence) == 0) return true;
      if (sequence.indexOf(used) == 0) return true;
    }
    return false;
  }

  // Then get accessKeys that have been declared by the site.
  var i = 0;
  while (i < allElements.length) {
    var el = allElements[i];
    if (!el.accessKey || isPrefixOrSuffixOfUsedShortcut(el.accessKey)) {
      i++;
      continue;
    }
    var el = allElements[i];
    removeFromArrayAt(allElements, i);
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
    // JavaScript handlers can (and often do) override the target of links.
    if (hasJavaScriptClickHandler(el)) continue;
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
  // Remove suffix and prefixes. This might lead to too few sequences, but
  // it should not happen too often.
  keySequences = keySequences.filter(function(seq) {
    return !isPrefixOrSuffixOfUsedShortcut(seq);
  });
  var nextFree = 0;

  // Now find all links, text-fields and buttons.
  for (var i = 0; i < visibleElements.length; ++i) {
    var el = visibleElements[i];

    if (el.nodeName == 'A' && !hasJavaScriptClickHandler(el)) {
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
        if (index == -1) index = keySequences.indexOf(normalizeChar(c));
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
        if (openInNewTab) {
          popup.className = 'ctrl_access_newtab_popup';
        } else {
          popup.className = 'ctrl_access_popup';
        }
      } else {
        var txt = document.createTextNode(replaceWhitespace(shortcut));
        popup.appendChild(txt);
        popup.className = 'ctrl_access_popup_inactive';
      }
    });
  }
}

// There is no way to know if a DOM element has an event listener attached to
// it. We have to intercept when event listeners are attached.
// Since the extension's and the page's site are sandboxed we have to go
// through the DOM to execute our code in the page's environment.
function addEventAttachmentInterceptor(document) {
  var injectedCode =
    "(function(original) {\
      Element.prototype.addEventListener = function(type) {\
        if (type === 'click' || type === 'mousedown') {\
          this.setAttribute('" + clickHandlerToken + "', true);" +
        "}\
        return original.apply(this, arguments);\
      }\
    })(Element.prototype.addEventListener);";
  var script = document.createElement("script");
  script.type = "text/javascript";
  script.appendChild(document.createTextNode(injectedCode));
  document.documentElement.appendChild(script);
  document.documentElement.removeChild(script);
}

function init() {
  var isShowingShortcuts = false;
  var isWaitingForTriggerUp = false;
  var triggerDownTime;
  var consumeNextKeyUp = false;
  var sequence = "";
  var trigger_key;

  function installEventListeners(rootNode) {
    var doc = rootNode.contentDocument || rootNode;
    var body = rootNode.body;

    if (!body || !body.addEventListener) {
      return;
    }

    body.addEventListener('keydown', function(ev) {
      consumeNextKeyUp = false;
      var code = ev.keyCode;
      if (code == getPreferences().trigger ||
          (code == getPreferences().trigger_newtab &&
           (isShowingShortcuts || !getPreferences().newtab_only_when_triggered))) {
        // Only reset the trigger time, if we are not yet waiting for a trigger.
        // Some platforms (ChromeOS, MacOS or Windows) repeatedly send an event
        // when the key is pressed down.
        // See https://code.google.com/p/chromium/issues/detail?id=435520
        if (!isWaitingForTriggerUp) {
          triggerDownTime = new Date().getTime();
          isWaitingForTriggerUp = true;
        }
        trigger_key = code;
        return;
      }
      isWaitingForTriggerUp = false;
      if (!isShowingShortcuts) return;
      ev.stopPropagation();
      ev.preventDefault();
      if (code == keycodes.shift) return;
      if (code == keycodes.backspace && sequence.length > 0) {
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
        var stillShowShortcuts = target && openInNewTab;
        if (stillShowShortcuts) {
          updatePopups(sequence);
        } else {
          isShowingShortcuts = false;
          hideShortcuts();
        }
      }
      consumeNextKeyUp = true;
      if (openInNewTab) {
        hideShortcuts();
        isShowingShortcuts = false;
      }
      if (target) simulateClick(target);
    }, true);

    body.addEventListener('keyup', function(ev) {
      var code = ev.keyCode;
      var currentlyWaitingForTriggerUp = isWaitingForTriggerUp;
      isWaitingForTriggerUp = false;
      if (code == trigger_key) {
        if (currentlyWaitingForTriggerUp) {
          if (isShowingShortcuts) {
            if (openInNewTab == (code == getPreferences().trigger_newtab)) {
              sequence = "";
              hideShortcuts();
              isShowingShortcuts = false;
            } else {
              openInNewTab = code == getPreferences().trigger_newtab;
              updatePopups(sequence);
            }
          } else {
            var triggerDuration = new Date().getTime() - triggerDownTime;
            // If it took too long to get the trigger-key up, we assume that it
            // was accidental.
            if (triggerDuration > MAX_TRIGGER_DURATION) {
              isWaitingForTripperUp = false;
              return;  // Don't stop propagation.
            } else {
              isShowingShortcuts = true;
              openInNewTab = code == getPreferences().trigger_newtab;
              showShortcuts();
            }
          }
          ev.stopPropagation();
          ev.preventDefault();
        }
      } else {
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
      isWaitingForTriggerUp = false;
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

  addEventAttachmentInterceptor(document);
}

init();
