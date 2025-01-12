// Track which tabs have had the content script injected
const injectedTabs = new Set();

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    // Check if we've already injected into this tab
    if (!injectedTabs.has(tabId)) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      })
      .then(() => {
        injectedTabs.add(tabId);
      })
      .catch(err => console.log('Script injection failed:', err));
    }
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

// Handle tab replacement (e.g., when a page is loaded from the back/forward cache)
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  injectedTabs.delete(removedTabId);
});