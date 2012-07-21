var defaultShortcutKeys =
    "fjdkeisawoghurcmnvtbyqzxpFJDKESLAWGHURCMNVTBYQZXP23456789";

var saveIsEnabled = false;

function getStoredPrefs() {
  try {
    return JSON.parse(localStorage.prefs);
  } catch(e) {
    return {};
  }
}

function save() {
  if (!saveIsEnabled) return;
  var prefs = getStoredPrefs();
  prefs.trigger = document.getElementById("trigger").value;
  prefs.trigger_newtab = document.getElementById("trigger_newtab").value;
  prefs.shortcut_keys = document.getElementById("shortcut_keys").value;
  prefs.only_one_char = !document.getElementById("multi_char").checked;
  prefs.newtab_only_when_triggered = document.getElementById("newtab_only_when_triggered").checked;
  if (prefs.trigger == prefs.trigger_newtab) {
    alert("Trigger key and trigger key to open link in new tab shouldn't " +
        "be same.");
    return false;
  }
  localStorage.prefs = JSON.stringify(prefs);
}

function saveHardcoded() {
  var prefs = getStoredPrefs();
  prefs.hardcoded = document.getElementById("hardcoded").value;
  localStorage.prefs = JSON.stringify(prefs);
}

// Make sure the checkbox checked state gets properly initialized from the
// saved preference.
window.onload = function() {
  saveIsEnabled = false;
  var prefs = getStoredPrefs();
  var firstTime = (typeof(prefs.trigger) === "undefined");

  var trigger = firstTime ? 17 : prefs.trigger;  // Control by default.
  var trigger_newtab = firstTime ? 18 : prefs.trigger_newtab;  // Alt by default.
  var shortcut_keys = firstTime ? defaultShortcutKeys : prefs.shortcut_keys;
  var multi_char = firstTime ? false : !prefs.only_one_char;
  var newtab_only_when_triggered =
      firstTime ? false : prefs.newtab_only_when_triggered;
  var hardcoded = firstTime ? "" : prefs.hardcoded;

  document.getElementById("trigger").value = trigger;
  document.getElementById("trigger_newtab").value = trigger_newtab;
  document.getElementById("shortcut_keys").value = shortcut_keys;
  document.getElementById("multi_char").checked = multi_char;
  document.getElementById("newtab_only_when_triggered").checked =
      newtab_only_when_triggered;
  document.getElementById("hardcoded").value = hardcoded;

  saveIsEnabled = true;
  if (firstTime) {
    save();
    saveHardcoded();
  }
}

function resetShortcutKeys() {
  document.getElementById('shortcut_keys').value = defaultShortcutKeys;
}

// Add event listeners once the DOM has fully loaded by listening for the
// `DOMContentLoaded` event on the document, and adding your listeners to
// specific elements when it triggers.
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById("trigger").addEventListener('change', save);
  document.getElementById("trigger_newtab").addEventListener('change', save);
  document.getElementById("shortcut_keys").addEventListener('input', save);
  document.getElementById("reset_to_default").addEventListener(
      'click', resetShortcutKeys);
  document.getElementById("multi_char").addEventListener('click', save);
  document.getElementById("newtab_only_when_triggered").addEventListener(
      'click', save);
  document.getElementById("save_hardcoded").addEventListener(
      'click', saveHardcoded);
});
