chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
  if (request.method == "getLocalStoragePrefs") {
    sendResponse({prefs: localStorage['prefs']});
  } else
    sendResponse({});  // Nothing to see.
});
