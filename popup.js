document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('highlightContainer');
    const clearAllBtn = document.getElementById('clearAll');
    const mergeBtn = document.getElementById('mergeSelected');
    const searchInput = document.getElementById('searchHighlights');
    const filterSelect = document.getElementById('filterByDomain');
    const mergedContainer = document.getElementById('mergedContainer');
    const mergedText = document.getElementById('mergedText');
    const copyMergedBtn = document.getElementById('copyMerged');
  
    let currentHighlights = {};
    let selectedHighlights = new Set();
    let currentlyEditing = null;
  
    function createHighlightElement(highlightId, data) {
      const highlightElement = document.createElement('div');
      highlightElement.className = 'highlight-item';
      highlightElement.dataset.highlightId = highlightId;
      if (selectedHighlights.has(highlightId)) {
        highlightElement.classList.add('selected');
      }
      
      // Text display div
      const textDiv = document.createElement('div');
      textDiv.className = 'highlight-text';
      textDiv.textContent = data.text;
      textDiv.addEventListener('click', (e) => {
        if (!highlightElement.classList.contains('editing')) {
          toggleHighlightSelection(highlightId, highlightElement);
        }
        e.stopPropagation();
      });
      
      // Text editor (hidden by default)
      const textEditor = document.createElement('textarea');
      textEditor.className = 'highlight-text-editor';
      textEditor.value = data.text;
      textEditor.addEventListener('click', (e) => e.stopPropagation());
      textEditor.addEventListener('mouseup', (e) => e.stopPropagation());
      
      // Edit controls (hidden by default)
      const editControls = document.createElement('div');
      editControls.className = 'edit-controls';
      
      const saveBtn = document.createElement('button');
      saveBtn.className = 'save-btn';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveEdit(highlightId, textEditor.value);
      });
      
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'cancel-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelEdit(highlightId);
      });
      
      editControls.appendChild(saveBtn);
      editControls.appendChild(cancelBtn);
      
      const urlDiv = document.createElement('div');
      urlDiv.className = 'highlight-url';
      const hostname = new URL(data.url).hostname;
      urlDiv.textContent = hostname;
      
      const timestampDiv = document.createElement('div');
      timestampDiv.className = 'highlight-timestamp';
      timestampDiv.textContent = new Date(data.timestamp).toLocaleString();
      
      // Button group for edit and delete
      const buttonGroup = document.createElement('div');
      buttonGroup.className = 'button-group';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-btn';
      editBtn.innerHTML = '✎';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startEdit(highlightId, highlightElement);
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteHighlight(highlightId, data.url);
      });
      
      // Add buttons to button group
      buttonGroup.appendChild(editBtn);
      buttonGroup.appendChild(deleteBtn);
      
      highlightElement.appendChild(textDiv);
      highlightElement.appendChild(textEditor);
      highlightElement.appendChild(editControls);
      highlightElement.appendChild(urlDiv);
      highlightElement.appendChild(timestampDiv);
      highlightElement.appendChild(buttonGroup);
      
      return highlightElement;
    }
  
    function startEdit(highlightId, element) {
      // If already editing another highlight, cancel that first
      if (currentlyEditing && currentlyEditing !== highlightId) {
        cancelEdit(currentlyEditing);
      }
      
      currentlyEditing = highlightId;
      element.classList.add('editing');
      const editor = element.querySelector('.highlight-text-editor');
      editor.focus();
    }
  
    async function saveEdit(highlightId, newText) {
      if (!newText.trim()) {
        alert('Highlight text cannot be empty');
        return;
      }
  
      try {
        const result = await chrome.storage.local.get(['highlights']);
        const highlights = result.highlights || {};
        
        if (highlights[highlightId]) {
          highlights[highlightId].text = newText.trim();
          
          // Update storage
          await chrome.storage.local.set({ highlights });
          
          // Update UI
          currentHighlights = highlights;
          
          // Update highlight in the webpage if we're on the same page
          const tabs = await chrome.tabs.query({active: true, currentWindow: true});
          if (tabs[0] && tabs[0].url === highlights[highlightId].url) {
            await sendMessageToActiveTab({
              action: 'updateHighlight',
              highlightId: highlightId,
              newText: newText.trim()
            });
          }
  
          // Refresh display after saving
          displayHighlights(
            currentHighlights,
            searchInput.value,
            filterSelect.value
          );
        }
      } catch (error) {
        console.error('Error saving edit:', error);
        alert('Failed to save changes');
      }
      
      currentlyEditing = null;
    }
  
    function cancelEdit(highlightId) {
      const element = container.querySelector(`[data-highlight-id="${highlightId}"]`);
      if (element) {
        element.classList.remove('editing');
        const editor = element.querySelector('.highlight-text-editor');
        editor.value = currentHighlights[highlightId].text;
      }
      currentlyEditing = null;
    }
  
    async function deleteHighlight(highlightId, highlightUrl) {
      try {
        const result = await chrome.storage.local.get(['highlights']);
        const highlights = result.highlights || {};
        
        delete highlights[highlightId];
        
        await chrome.storage.local.set({ highlights });
        
        // Update UI
        currentHighlights = highlights;
        selectedHighlights.delete(highlightId);
        
        if (selectedHighlights.size < 2) {
          clearMergedView();
        } else if (selectedHighlights.has(highlightId)) {
          mergeSelectedHighlights();
        }
        
        displayHighlights(highlights, searchInput.value, filterSelect.value);
        
        // Remove highlight from webpage if we're on the same page
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs[0] && tabs[0].url === highlightUrl) {
          await sendMessageToActiveTab({
            action: 'removeHighlight',
            highlightId: highlightId
          });
        }
      } catch (error) {
        console.error('Error deleting highlight:', error);
      }
    }
  
    function toggleHighlightSelection(highlightId, element) {
      if (currentlyEditing === highlightId) return;
      
      if (selectedHighlights.has(highlightId)) {
        selectedHighlights.delete(highlightId);
        element.classList.remove('selected');
      } else {
        selectedHighlights.add(highlightId);
        element.classList.add('selected');
      }
      updateMergeButtonState();
    }
  
    function updateMergeButtonState() {
      mergeBtn.disabled = selectedHighlights.size < 2;
    }
  
    function displayHighlights(highlights = currentHighlights, searchTerm = '', selectedDomain = 'all') {
      container.innerHTML = '';
  
      if (Object.keys(highlights).length === 0) {
        container.innerHTML = '<div class="no-highlights">No highlights yet</div>';
        return;
      }
  
      const sortedHighlights = Object.entries(highlights)
        .sort(([,a], [,b]) => b.timestamp - a.timestamp)
        .filter(([, data]) => {
          if (searchTerm) {
            return data.text.toLowerCase().includes(searchTerm.toLowerCase());
          }
          return true;
        })
        .filter(([, data]) => {
          if (selectedDomain === 'all') return true;
          const hostname = new URL(data.url).hostname;
          return hostname === selectedDomain;
        });
  
      if (sortedHighlights.length === 0) {
        container.innerHTML = '<div class="no-highlights">No matches found</div>';
        return;
      }
  
      sortedHighlights.forEach(([highlightId, data]) => {
        const highlightElement = createHighlightElement(highlightId, data);
        container.appendChild(highlightElement);
      });
  
      updateDomainFilter(highlights);
      updateMergeButtonState();
    }
  
    function updateDomainFilter(highlights) {
      const domains = new Set();
      Object.values(highlights).forEach(data => {
        try {
          const hostname = new URL(data.url).hostname;
          domains.add(hostname);
        } catch (e) {
          console.error('Error parsing URL:', e);
        }
      });
  
      const currentValue = filterSelect.value;
      filterSelect.innerHTML = '<option value="all">All Domains</option>';
      
      Array.from(domains).sort().forEach(domain => {
        const option = document.createElement('option');
        option.value = domain;
        option.textContent = domain;
        filterSelect.appendChild(option);
      });
      
      filterSelect.value = currentValue;
    }
  
    async function sendMessageToActiveTab(message) {
      try {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs[0]) {
          await chrome.tabs.sendMessage(tabs[0].id, message);
        }
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  
    function mergeSelectedHighlights() {
      const merged = Array.from(selectedHighlights)
        .map(id => currentHighlights[id].text)
        .join('\n\n');
  
      mergedText.value = merged;
      mergedContainer.classList.add('show');
      mergedText.style.height = 'auto';
      mergedText.style.height = mergedText.scrollHeight + 'px';
    }
  
    function clearMergedView() {
      selectedHighlights.clear();
      mergedContainer.classList.remove('show');
      mergedText.value = '';
      updateMergeButtonState();
    }
  
    // Event Listeners
    clearAllBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to clear all highlights?')) {
        chrome.storage.local.set({ highlights: {} }, async function() {
          currentHighlights = {};
          selectedHighlights.clear();
          clearMergedView();
          displayHighlights();
          sendMessageToActiveTab({
            action: 'removeAllHighlights'
          });
        });
      }
    });
  
    mergeBtn.addEventListener('click', mergeSelectedHighlights);
  
    copyMergedBtn.addEventListener('click', function() {
      mergedText.select();
      navigator.clipboard.writeText(mergedText.value);
      copyMergedBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyMergedBtn.textContent = 'Copy to Clipboard';
      }, 2000);
    });
  
    searchInput.addEventListener('input', function(e) {
      displayHighlights(currentHighlights, e.target.value, filterSelect.value);
    });
  
    filterSelect.addEventListener('change', function(e) {
      displayHighlights(currentHighlights, searchInput.value, e.target.value);
    });
  
    // Auto-refresh highlights every 2 seconds
    setInterval(() => {
      chrome.storage.local.get(['highlights'], function(result) {
        currentHighlights = result.highlights || {};
        // Only refresh if not editing
        if (!currentlyEditing) {
          displayHighlights(
            currentHighlights,
            searchInput.value,
            filterSelect.value
          );
        }
      });
    }, 2000);
  
    // Initial display
    chrome.storage.local.get(['highlights'], function(result) {
      currentHighlights = result.highlights || {};
      displayHighlights();
    });
  });