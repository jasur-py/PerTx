// Function to safely check if extension context is valid
function isExtensionValid() {
    try {
        chrome.runtime.getURL('');
        return true;
    } catch (e) {
        return false;
    }
}

// Function to generate a unique ID for each highlight
function generateHighlightId() {
    return 'highlight-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Function to safely use chrome storage
function safeStorageGet(callback) {
    if (!isExtensionValid()) return;
    try {
        chrome.storage.local.get(['highlights'], callback);
    } catch (e) {
        console.error('Storage get error:', e);
    }
}

// Function to safely use chrome storage set
function safeStorageSet(data, callback) {
    if (!isExtensionValid()) return;
    try {
        chrome.storage.local.set(data, callback);
    } catch (e) {
        console.error('Storage set error:', e);
    }
}

// Function to normalize URL for consistent highlighting across similar URLs
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);
        // Remove common tracking parameters
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];
        paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
        // Return URL without fragment
        return urlObj.origin + urlObj.pathname + urlObj.search;
    } catch (e) {
        console.error('URL normalization error:', e);
        return url;
    }
}

// Function to check if node contains block elements
function containsBlockElements(node) {
    if (!node || !node.children) return false;
    try {
        const blockTags = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'DIV', 'SECTION', 'ARTICLE'];
        return Array.from(node.children || []).some(child => blockTags.includes(child.tagName));
    } catch (e) {
        console.error('Error checking block elements:', e);
        return false;
    }
}

// Function to get text nodes in range
function getTextNodesInRange(range) {
    const textNodes = [];
    const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while (node = walker.nextNode()) {
        const nodeRange = document.createRange();
        nodeRange.selectNode(node);
        
        if (range.intersectsNode(node)) {
            textNodes.push(node);
        }
    }
    return textNodes;
}

// Function to highlight a specific text node
function highlightTextNode(textNode, start, end, highlightId) {
    try {
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);

        const span = document.createElement('span');
        span.className = 'web-highlighter-highlight';
        span.dataset.highlightId = highlightId;

        const parentBlock = getClosestBlockElement(textNode);
        if (parentBlock) {
            span.classList.add(`highlight-${parentBlock.tagName.toLowerCase()}`);
        }

        range.surroundContents(span);
        return true;
    } catch (e) {
        console.error('Error highlighting text node:', e);
        return false;
    }
}

// Function to create highlight
function createHighlight(range, highlightId) {
    if (!range || !highlightId) return;

    try {
        const textNodes = getTextNodesInRange(range);
        
        textNodes.forEach((node, index) => {
            let start = 0;
            let end = node.length;

            if (node === range.startContainer) {
                start = range.startOffset;
            }

            if (node === range.endContainer) {
                end = range.endOffset;
            }

            if (end > start) {
                highlightTextNode(node, start, end, highlightId);
            }
        });

    } catch (error) {
        console.error('Highlight error:', error);
    }
}

// Function to get the closest block element
function getClosestBlockElement(node) {
    const blockTags = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'DIV', 'SECTION', 'ARTICLE'];
    let current = node;
    
    while (current && current.parentNode) {
        if (current.nodeType === Node.ELEMENT_NODE && blockTags.includes(current.tagName)) {
            return current;
        }
        current = current.parentNode;
    }
    return null;
}

// Function to get XPath for an element
function getXPathForElement(element) {
    try {
        if (!element) return '';
        if (element.nodeType === Node.TEXT_NODE) {
            element = element.parentNode;
        }
        
        let xpath = '';
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let pos = 0;
            let sibling = element.previousSibling;
            
            while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && 
                    sibling.tagName === element.tagName) {
                    pos++;
                }
                sibling = sibling.previousSibling;
            }
            
            const tagName = element.tagName.toLowerCase();
            const position = pos === 0 ? '' : `[${pos + 1}]`;
            xpath = `/${tagName}${position}${xpath}`;
            
            element = element.parentNode;
        }
        
        return xpath;
    } catch (e) {
        console.error('XPath generation error:', e);
        return '';
    }
}

// Function to save highlight to Chrome storage
function saveHighlight(highlightId, text, range) {
    safeStorageGet(function(result) {
        const highlights = result.highlights || {};
        highlights[highlightId] = {
            text: text,
            url: normalizeUrl(window.location.href),
            timestamp: Date.now(),
            xpath: getXPathForElement(range.startContainer),
            offset: range.startOffset,
            length: text.length
        };
        safeStorageSet({ highlights: highlights });
    });
}

// Function to remove highlight
function removeHighlight(highlightId) {
    try {
        const highlight = document.querySelector(`[data-highlight-id="${highlightId}"]`);
        if (highlight && highlight.parentNode) {
            const parent = highlight.parentNode;
            while (highlight.firstChild) {
                parent.insertBefore(highlight.firstChild, highlight);
            }
            parent.removeChild(highlight);
        }
    } catch (e) {
        console.error('Error removing highlight:', e);
    }
}

// Function to remove all highlights
function removeAllHighlights() {
    try {
        const highlights = document.querySelectorAll('.web-highlighter-highlight');
        highlights.forEach(highlight => {
            if (highlight.dataset.highlightId) {
                removeHighlight(highlight.dataset.highlightId);
            }
        });
    } catch (e) {
        console.error('Error removing all highlights:', e);
    }
}

// Function to evaluate XPath
function evaluateXPath(xpath) {
    try {
        return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch (e) {
        console.error('XPath evaluation error:', e);
        return null;
    }
}

// Function to update highlight text
function updateHighlightText(highlightId, newText) {
    try {
        const highlight = document.querySelector(`[data-highlight-id="${highlightId}"]`);
        if (highlight) {
            // Store the parent and position
            const parent = highlight.parentNode;
            const index = Array.from(parent.childNodes).indexOf(highlight);

            // Remove the old highlight
            removeHighlight(highlightId);

            // Create a text node with the new text
            const textNode = document.createTextNode(newText);
            
            // Insert at the same position
            if (index === parent.childNodes.length) {
                parent.appendChild(textNode);
            } else {
                parent.insertBefore(textNode, parent.childNodes[index]);
            }

            // Create a new range for the new text
            const range = document.createRange();
            range.selectNodeContents(textNode);

            // Create new highlight with same ID
            createHighlight(range, highlightId);
            
            // Update storage
            safeStorageGet(function(result) {
                const highlights = result.highlights || {};
                if (highlights[highlightId]) {
                    highlights[highlightId].text = newText;
                    highlights[highlightId].timestamp = Date.now(); // Update timestamp
                    safeStorageSet({ highlights: highlights });
                }
            });
            
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error updating highlight:', e);
        return false;
    }
}

// Function to restore highlights
function restoreHighlights() {
    if (!isExtensionValid()) return;

    safeStorageGet(function(result) {
        const highlights = result.highlights || {};
        const currentUrl = normalizeUrl(window.location.href);
        
        Object.entries(highlights).forEach(([highlightId, data]) => {
            if (data.url === currentUrl) {
                try {
                    // First try XPath
                    if (data.xpath) {
                        const element = evaluateXPath(data.xpath);
                        if (element) {
                            let found = false;
                            const walker = document.createTreeWalker(
                                element,
                                NodeFilter.SHOW_TEXT,
                                null,
                                false
                            );

                            let node;
                            while (node = walker.nextNode()) {
                                if (node.textContent.includes(data.text)) {
                                    const range = document.createRange();
                                    const startIndex = node.textContent.indexOf(data.text);
                                    range.setStart(node, startIndex);
                                    range.setEnd(node, startIndex + data.text.length);
                                    
                                    if (!containsBlockElements(range.commonAncestorContainer)) {
                                        createHighlight(range, highlightId);
                                        found = true;
                                        break;
                                    }
                                }
                            }
                            if (found) {
                                return;
                            }
                        }
                    }

                    // Fallback to full document search if XPath fails
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                        {
                            acceptNode: function(node) {
                                if (!node || !node.parentNode) return NodeFilter.FILTER_REJECT;
                                return !containsBlockElements(node.parentNode) ? 
                                    NodeFilter.FILTER_ACCEPT : 
                                    NodeFilter.FILTER_REJECT;
                            }
                        }
                    );

                    let node;
                    while (node = walker.nextNode()) {
                        if (node.textContent.includes(data.text)) {
                            const range = document.createRange();
                            const startIndex = node.textContent.indexOf(data.text);
                            range.setStart(node, startIndex);
                            range.setEnd(node, startIndex + data.text.length);
                            
                            if (!containsBlockElements(range.commonAncestorContainer)) {
                                createHighlight(range, highlightId);
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error restoring highlight:', e);
                }
            }
        });
    });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (!isExtensionValid()) return;

    switch(request.action) {
        case 'removeHighlight':
            removeHighlight(request.highlightId);
            break;
        case 'removeAllHighlights':
            removeAllHighlights();
            break;
        case 'updateHighlight':
            updateHighlightText(request.highlightId, request.newText);
            break;
    }
});

// Event listener for text selection
document.addEventListener('mouseup', function() {
    if (!isExtensionValid()) return;

    try {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        
        const text = selection.toString();
        if (text.trim().length > 0) {
            const range = selection.getRangeAt(0);
            if (!range) return;

            const highlightId = generateHighlightId();
            
            // Save the highlight
            saveHighlight(highlightId, text, range);
            
            // Create the visual highlight
            createHighlight(range, highlightId);
            
            // Clear the selection
            selection.removeAllRanges();
        }
    } catch (e) {
        console.error('Selection error:', e);
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restoreHighlights);
} else {
    restoreHighlights();
}