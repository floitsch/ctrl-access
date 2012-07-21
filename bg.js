chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
  if (request.method == "getLocalStoragePrefs") {
    var t = localStorage['prefs'];
    sendResponse({prefs: localStorage['prefs']});
  } else
    sendResponse({});  // Nothing to see.
});
