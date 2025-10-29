class SelectionBubble {
  constructor() {
    this.bubble = null;
    this.selectedText = '';
    this.selectionRange = null;
    this.highlightColor = '#ffff00';
    this.isProcessing = false;
    this.init();
  }

  init() {
    if (window.location.protocol === 'chrome-extension:') {
      return;
    }

    this.createBubble();
    this.attachEventListeners();
    this.restoreHighlights();
  }

  createBubble() {
    const existing = document.getElementById('smartcopy-selection-bubble');
    if (existing) existing.remove();

    this.bubble = document.createElement('div');
    this.bubble.id = 'smartcopy-selection-bubble';
    this.bubble.className = 'smartcopy-bubble-hidden';
    this.bubble.setAttribute('role', 'toolbar');
    this.bubble.setAttribute('aria-label', 'Text selection tools');
    
    this.bubble.innerHTML = `
      <div class="smartcopy-bubble-content">
        <button class="smartcopy-btn" data-action="copy" title="Copy to SmartCopy" aria-label="Copy text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy</span>
        </button>
        <div class="smartcopy-highlight-group">
          <button class="smartcopy-btn smartcopy-btn-highlight" data-action="highlight" title="Highlight text" aria-label="Highlight text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"></path>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
            <span>Highlight</span>
          </button>
          <div class="smartcopy-color-picker">
            <button class="smartcopy-color-btn active" data-color="#ffff00" style="background: #ffff00" title="Yellow"></button>
            <button class="smartcopy-color-btn" data-color="#90EE90" style="background: #90EE90" title="Green"></button>
            <button class="smartcopy-color-btn" data-color="#87CEEB" style="background: #87CEEB" title="Blue"></button>
            <button class="smartcopy-color-btn" data-color="#FFB6C1" style="background: #FFB6C1" title="Pink"></button>
            <button class="smartcopy-color-btn" data-color="#FFD700" style="background: #FFD700" title="Gold"></button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.bubble);

    this.bubble.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleCopy();
    });

    this.bubble.querySelector('[data-action="highlight"]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleHighlight();
    });

    this.bubble.querySelectorAll('.smartcopy-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const color = e.currentTarget.getAttribute('data-color');
        this.highlightColor = color;
        
        this.bubble.querySelectorAll('.smartcopy-color-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        this.handleHighlight();
      });
    });
  }

  attachEventListeners() {
    let selectionTimeout;

    document.addEventListener('mouseup', (e) => {
      if (this.bubble && this.bubble.contains(e.target)) {
        return;
      }

      clearTimeout(selectionTimeout);
      selectionTimeout = setTimeout(() => {
        this.handleSelection(e);
      }, 150);
    });

    document.addEventListener('mousedown', (e) => {
      if (this.bubble && !this.bubble.contains(e.target)) {
        this.hideBubble();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.bubble) {
        this.hideBubble();
      }
    });

    let scrollTimeout;
    document.addEventListener('scroll', () => {
      if (!this.bubble.classList.contains('smartcopy-bubble-hidden')) {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          this.hideBubble();
        }, 100);
      }
    }, true);
  }

  handleSelection(event) {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (!text || text.length < 3) {
      this.hideBubble();
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return;
    }

    this.selectedText = text;
    
    try {
      if (selection.rangeCount > 0) {
        this.selectionRange = selection.getRangeAt(0).cloneRange();
      }
      this.showBubble(event);
    } catch (error) {
      console.error('Selection error:', error);
    }
  }

  showBubble(event) {
    if (!this.bubble) return;

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const bubbleWidth = 260;
    const bubbleHeight = 90;
    const padding = 10;
    
    let top = rect.top + window.scrollY - bubbleHeight - padding;
    let left = rect.left + window.scrollX + (rect.width / 2) - (bubbleWidth / 2);

    if (rect.top < bubbleHeight + padding) {
      top = rect.bottom + window.scrollY + padding;
    }

    if (left < padding) {
      left = padding;
    }

    const maxLeft = window.innerWidth - bubbleWidth - padding;
    if (left > maxLeft) {
      left = maxLeft;
    }

    this.bubble.style.top = `${top}px`;
    this.bubble.style.left = `${left}px`;
    this.bubble.classList.remove('smartcopy-bubble-hidden');
    this.bubble.classList.add('smartcopy-bubble-visible');
  }

  hideBubble() {
    if (!this.bubble) return;
    
    this.bubble.classList.remove('smartcopy-bubble-visible');
    this.bubble.classList.add('smartcopy-bubble-hidden');
  }

  async handleCopy() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.capturePageContext();
      
      const response = await chrome.runtime.sendMessage({
        action: 'copyText',
        data: { text: this.selectedText }
      });

      if (response.success) {
        await chrome.runtime.sendMessage({ action: 'openSidePanel' });
        this.showFeedback('✓ Copied to SmartCopy', 'success');
      } else {
        throw new Error(response.error || 'Copy failed');
      }
    } catch (error) {
      console.error('Copy error:', error);
      this.showFeedback('✗ Copy failed', 'error');
    } finally {
      this.isProcessing = false;
      this.hideBubble();
    }
  }

  async handleHighlight() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const selection = window.getSelection();
      if (!selection.rangeCount) {
        throw new Error('No selection available');
      }
      
      const range = selection.getRangeAt(0).cloneRange();
      const selectedText = selection.toString().trim();

      if (!selectedText) {
        throw new Error('No text selected');
      }

      const highlightId = `smartcopy-${Date.now()}`;
      const span = document.createElement('span');
      span.className = 'smartcopy-highlight';
      span.style.backgroundColor = this.highlightColor;
      span.setAttribute('data-smartcopy-id', highlightId);
      span.setAttribute('title', 'SmartCopy highlight - Click to remove');

      try {
        range.surroundContents(span);
      } catch (e) {
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
      }

      span.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeHighlight(span);
      });

      selection.removeAllRanges();

      const response = await chrome.runtime.sendMessage({
        action: 'highlightText',
        data: {
          text: selectedText,
          color: this.highlightColor,
          highlightId: highlightId,
          range: {
            startOffset: range.startOffset,
            endOffset: range.endOffset
          }
        }
      });

      if (response.success) {
        this.showFeedback('✓ Highlighted', 'success');
      } else {
        throw new Error(response.error || 'Highlight failed');
      }
    } catch (error) {
      console.error('Highlight error:', error);
      this.showFeedback('✗ Highlight failed', 'error');
    } finally {
      this.isProcessing = false;
      this.hideBubble();
    }
  }

  async capturePageContext() {
    try {
      await chrome.runtime.sendMessage({
        action: 'captureContext',
        data: {
          url: window.location.href,
          title: document.title,
          snippet: this.selectedText
        }
      });
    } catch (error) {
      console.log('Context capture skipped:', error);
    }
  }

  removeHighlight(element) {
    const parent = element.parentNode;
    if (!parent) return;

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
    parent.normalize();

    this.showFeedback('✓ Highlight removed', 'success');
  }

  restoreHighlights() {
  }

  showFeedback(message, type = 'success') {
    const feedback = document.createElement('div');
    feedback.className = `smartcopy-feedback smartcopy-feedback-${type}`;
    feedback.textContent = message;
    feedback.setAttribute('role', 'alert');
    feedback.setAttribute('aria-live', 'polite');
    
    document.body.appendChild(feedback);

    requestAnimationFrame(() => {
      feedback.classList.add('smartcopy-feedback-show');
    });

    setTimeout(() => {
      feedback.classList.remove('smartcopy-feedback-show');
      setTimeout(() => feedback.remove(), 300);
    }, 2000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SelectionBubble();
  });
} else {
  new SelectionBubble();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'clearHighlights') {
    document.querySelectorAll('.smartcopy-highlight').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
      }
    });
    sendResponse({ success: true });
  }
});
