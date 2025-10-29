import { StorageManager } from '../utils/storage.js';
import { AIProcessor } from '../utils/ai-processor.js';
import { SessionManager } from '../utils/session-manager.js';
import { TabGrouper } from '../utils/tab-grouper.js';
import { ContextManager } from '../utils/context-manager.js';

class SidePanelManager {
  constructor() {
    this.storage = new StorageManager();
    this.aiProcessor = new AIProcessor();
    this.sessionManager = new SessionManager();
    this.tabGrouper = new TabGrouper();
    this.contextManager = new ContextManager();
    
    this.currentItem = null;
    this.isAIReady = false;
    this.selectedTranslateLang = 'es';
    
    this.allItems = [];
    this.filteredItems = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
    
    this.sessions = [];
    this.currentSession = null;
    this.pendingTabsData = null;
    
    this.init();
  }

  async init() {
    try {
      await this.storage.initialize();
      await this.sessionManager.initialize();
      await this.contextManager.initialize();
      
      await this.checkAIAvailability();
      this.setupEventListeners();
      await this.loadHistory();
      await this.loadSessions();
      this.listenForUpdates();
    } catch (error) {
      console.error('Initialization error:', error);
      this.showToast('Failed to initialize extension', 'error');
    }
  }

  async checkAIAvailability() {
    try {
      await this.aiProcessor.initialize();
      this.isAIReady = this.aiProcessor.isReady;
      
      if (!this.isAIReady) {
        this.showAIStatusBanner();
        this.disableAIButtons();
      } else {
        console.log('✅ AI features ready');
      }
    } catch (error) {
      console.error('AI check error:', error);
      this.showAIStatusBanner();
      this.disableAIButtons();
    }
  }

  showAIStatusBanner() {
    const banner = document.getElementById('aiStatusBanner');
    const message = document.getElementById('aiStatusMessage');
    
    message.textContent = 'AI features require Gemini Nano. Enable in chrome://flags';
    banner.classList.remove('hidden');
  }

  disableAIButtons() {
    document.querySelectorAll('[data-requires-ai="true"]').forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = 'Requires Gemini Nano AI model';
    });
  }

  setupEventListeners() {
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.getAttribute('data-action');
        this.handleAction(action);
      });
    });

    document.getElementById('clearAllBtn').addEventListener('click', () => {
      this.clearAllItems();
    });

    document.getElementById('closeCurrentBtn').addEventListener('click', () => {
      this.clearCurrentItem();
    });

    const langSelect = document.getElementById('translateLang');
    if (langSelect) {
      this.loadTranslateLanguage();
      langSelect.addEventListener('change', (e) => {
        this.selectedTranslateLang = e.target.value;
        this.saveTranslateLanguage(e.target.value);
        this.showToast(`Translation language set to ${e.target.options[e.target.selectedIndex].text}`, 'success');
      });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.applyFilters();
        
        const clearBtn = document.getElementById('clearSearch');
        if (this.searchQuery) {
          clearBtn.classList.remove('hidden');
        } else {
          clearBtn.classList.add('hidden');
        }
      });
    }

    const clearSearchBtn = document.getElementById('clearSearch');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        this.applyFilters();
        clearSearchBtn.classList.add('hidden');
        searchInput.focus();
      });
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filter = e.currentTarget.getAttribute('data-filter');
        this.setFilter(filter);
      });
    });

    document.getElementById('newSessionBtn')?.addEventListener('click', () => {
      this.openSessionModal();
    });

    document.getElementById('saveTabsSessionBtn')?.addEventListener('click', () => {
      this.saveCurrentTabsAsSession();
    });

    document.getElementById('groupTabsBtn')?.addEventListener('click', () => {
      this.groupOpenTabs();
    });

    document.getElementById('closeModal')?.addEventListener('click', () => {
      this.closeSessionModal();
    });

    document.getElementById('cancelModal')?.addEventListener('click', () => {
      this.closeSessionModal();
    });

    document.getElementById('saveSession')?.addEventListener('click', () => {
      this.createNewSession();
    });

    document.getElementById('sessionModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'sessionModal') {
        this.closeSessionModal();
      }
    });
  }

  setFilter(filter) {
    this.currentFilter = filter;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
    
    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.allItems];
    
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter(item => item.type === this.currentFilter);
    }
    
    if (this.searchQuery) {
      filtered = filtered.filter(item => {
        const textMatch = item.text.toLowerCase().includes(this.searchQuery);
        const titleMatch = item.sourceTitle?.toLowerCase().includes(this.searchQuery);
        const urlMatch = item.sourceUrl?.toLowerCase().includes(this.searchQuery);
        return textMatch || titleMatch || urlMatch;
      });
    }
    
    this.filteredItems = filtered;
    this.renderFilteredItems();
  }

  renderFilteredItems() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    
    if (this.filteredItems.length === 0) {
      this.showNoResults();
      return;
    }
    
    this.filteredItems.forEach(item => {
      this.addHistoryItem(item, true);
    });
  }

  showNoResults() {
    const historyList = document.getElementById('historyList');
    const message = this.searchQuery 
      ? `No results found for "${this.searchQuery}"`
      : 'No items in this category';
    
    historyList.innerHTML = `
      <div class="no-results">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <p>${message}</p>
        <p class="no-results-subtitle">Try a different search term or filter</p>
      </div>
    `;
  }

  updateFilterCounts() {
    const copyCount = this.allItems.filter(item => item.type === 'copy').length;
    const highlightCount = this.allItems.filter(item => item.type === 'highlight').length;
    
    document.getElementById('countAll').textContent = this.allItems.length;
    document.getElementById('countCopy').textContent = copyCount;
    document.getElementById('countHighlight').textContent = highlightCount;
  }

  async loadHistory() {
    try {
      this.allItems = await this.storage.getAllItems();
      this.allItems.reverse();
      
      this.updateFilterCounts();
      this.applyFilters();
    } catch (error) {
      console.error('Load history error:', error);
    }
  }

  listenForUpdates() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'clipboardUpdated') {
        this.allItems.unshift(message.data);
        this.updateFilterCounts();
        this.applyFilters();
        this.setCurrentItem(message.data);
        sendResponse({ success: true });
      }
    });
  }

  setCurrentItem(item) {
    this.currentItem = item;
    const currentItemDiv = document.getElementById('currentItem');
    const currentText = document.getElementById('currentText');
    
    currentText.textContent = item.text;
    currentItemDiv.classList.remove('hidden');
    currentItemDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  clearCurrentItem() {
    this.currentItem = null;
    document.getElementById('currentItem').classList.add('hidden');
  }

  addHistoryItem(item, prepend = false) {
    const historyList = document.getElementById('historyList');
    
    const emptyState = historyList.querySelector('.empty-state, .no-results');
    if (emptyState) {
      emptyState.remove();
    }

    const itemEl = document.createElement('div');
    itemEl.className = 'history-item';
    if (item.saved) {
      itemEl.classList.add('is-saved');
    }
    itemEl.setAttribute('data-id', item.id);
    itemEl.setAttribute('role', 'article');
    
    const savedClass = item.saved ? 'item-saved' : '';
    
    const icon = item.type === 'highlight' ? 
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 11l3 3L22 4"></path>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
      </svg>` :
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>`;

    const saveButton = item.saved ? 
      `<button class="btn-icon history-item-save is-saved" data-id="${item.id}" title="Already saved to session">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>` :
      `<button class="btn-icon history-item-save" data-id="${item.id}" title="Add to session">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>`;

    itemEl.innerHTML = `
      <div class="history-item-header">
        <div class="history-item-icon">${icon}</div>
        <div class="history-item-meta">
          <div class="history-item-title ${savedClass}">${this.escapeHtml(this.truncate(item.sourceTitle || 'Untitled', 40))}</div>
          <div class="history-item-time">${this.formatTime(item.timestamp)}</div>
        </div>
        ${saveButton}
        <button class="btn-icon history-item-delete" data-id="${item.id}" aria-label="Delete item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
      <div class="history-item-text">${this.escapeHtml(this.truncate(item.text, 150))}</div>
    `;

    itemEl.addEventListener('click', (e) => {
      if (!e.target.closest('.history-item-delete') && !e.target.closest('.history-item-save')) {
        this.setCurrentItem(item);
      }
    });

    const saveBtn = itemEl.querySelector('.history-item-save');
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!item.saved) {
        this.addItemToSession(item.id);
      }
    });

    const deleteBtn = itemEl.querySelector('.history-item-delete');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.deleteItem(item.id);
      itemEl.remove();
      
      if (historyList.children.length === 0) {
        this.showEmptyState();
      }
    });

    if (prepend) {
      historyList.appendChild(itemEl);
    } else {
      historyList.insertBefore(itemEl, historyList.firstChild);
    }
  }

  async handleAction(action) {
    if (!this.currentItem) {
      this.showToast('No item selected', 'error');
      return;
    }

    const statusDiv = document.getElementById('aiStatus');
    const statusText = document.getElementById('aiStatusText');
    
    try {
      let result = this.currentItem.text;

      if (action === 'copyOriginal') {
        await this.copyToClipboard(result);
        this.showToast('✓ Copied original text', 'success');
        return;
      }

      if (action === 'copyClean') {
        result = this.cleanText(result);
        await this.copyToClipboard(result);
        this.showToast('✓ Copied clean text', 'success');
        return;
      }

      if (!this.isAIReady) {
        this.showToast('AI features require Gemini Nano', 'error');
        return;
      }

      if (result.length > 1000) {
        statusText.textContent = 'Processing large text (may take 10-20 seconds)...';
      }

      statusDiv.classList.remove('hidden');
      const startTime = Date.now();

      switch (action) {
        case 'summarize':
          statusText.textContent = `Summarizing${result.length > 500 ? ' (processing...)' : '...'}`;
          result = await this.aiProcessor.summarize(result);
          break;

        case 'rephrase':
          statusText.textContent = `Rephrasing${result.length > 500 ? ' (processing...)' : '...'}`;
          result = await this.aiProcessor.rephrase(result);
          break;

        case 'proofread':
          statusText.textContent = `Proofreading${result.length > 500 ? ' (processing...)' : '...'}`;
          result = await this.aiProcessor.proofread(result);
          break;

        case 'translate':
          statusText.textContent = `Translating to ${this.getLanguageName(this.selectedTranslateLang)}...`;
          result = await this.aiProcessor.translate(result, this.selectedTranslateLang);
          break;

        default:
          throw new Error('Unknown action');
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      await this.copyToClipboard(result);
      this.showToast(`✓ ${this.capitalize(action)}d in ${duration}s`, 'success');
      
      document.getElementById('currentText').textContent = result;
      this.currentItem.text = result;

    } catch (error) {
      console.error('Action error:', error);
      this.showToast(`✗ ${error.message || 'Action failed'}`, 'error');
    } finally {
      statusDiv.classList.add('hidden');
    }
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  async deleteItem(id) {
    try {
      await this.storage.deleteItem(id);
      this.allItems = this.allItems.filter(item => item.id !== id);
      this.updateFilterCounts();
      this.applyFilters();
      
      if (this.currentItem && this.currentItem.id === id) {
        this.clearCurrentItem();
      }
    } catch (error) {
      console.error('Delete error:', error);
      this.showToast('Failed to delete item', 'error');
    }
  }

  async clearAllItems() {
    if (!confirm('Clear all clipboard items? This cannot be undone.')) {
      return;
    }
    
    try {
      await this.storage.clearAll();
      this.allItems = [];
      this.filteredItems = [];
      this.updateFilterCounts();
      this.showEmptyState();
      this.clearCurrentItem();
      this.showToast('All items cleared', 'success');
    } catch (error) {
      console.error('Clear all error:', error);
      this.showToast('Failed to clear items', 'error');
    }
  }

  showEmptyState() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <p>No items yet</p>
        <p class="empty-subtitle">Select text on any webpage to get started</p>
      </div>
    `;
  }

  async loadSessions() {
    try {
      this.sessions = await this.sessionManager.getAllSessions();
      this.renderSessions();
    } catch (error) {
      console.error('Load sessions error:', error);
    }
  }

  renderSessions() {
    const sessionsList = document.getElementById('sessionsList');
    
    if (this.sessions.length === 0) {
      sessionsList.innerHTML = `
        <div class="session-empty">
          No sessions yet. Create one to save your research!
        </div>
      `;
      return;
    }

    sessionsList.innerHTML = '';
    
    this.sessions.forEach(session => {
      const card = document.createElement('div');
      card.className = 'session-card';
      card.setAttribute('data-session-id', session.id);
      
      const itemCount = session.items?.length || 0;
      const contextCount = session.contexts?.length || 0;
      const tabCount = session.tabs?.length || session.tabCount || 0;
      const date = new Date(session.createdAt).toLocaleDateString();
      
      card.innerHTML = `
        <div class="session-card-header">
          <div class="session-name">${this.escapeHtml(session.name)}</div>
          <div class="session-actions">
            <button class="btn-icon" data-action="delete" title="Delete session">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="session-meta">
          <span class="session-count">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            ${itemCount} items
          </span>
          <span class="session-count">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
            </svg>
            ${tabCount} tabs
          </span>
          <span>${date}</span>
        </div>
      `;
      
      card.addEventListener('click', (e) => {
        if (!e.target.closest('[data-action]')) {
          this.viewSession(session);
        }
      });
      
      const deleteBtn = card.querySelector('[data-action="delete"]');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.deleteSession(session.id);
      });
      
      sessionsList.appendChild(card);
    });
  }

  openSessionModal(session = null) {
    const modal = document.getElementById('sessionModal');
    const nameInput = document.getElementById('sessionName');
    const descInput = document.getElementById('sessionDescription');
    
    if (session) {
      document.getElementById('modalTitle').textContent = 'Edit Session';
      nameInput.value = session.name;
      descInput.value = session.description || '';
    } else {
      document.getElementById('modalTitle').textContent = 'Create New Session';
      nameInput.value = '';
      descInput.value = '';
    }
    
    modal.classList.remove('hidden');
    nameInput.focus();
  }

  closeSessionModal() {
    const modal = document.getElementById('sessionModal');
    modal.classList.add('hidden');
  }

  async createNewSession() {
    const nameInput = document.getElementById('sessionName');
    const descInput = document.getElementById('sessionDescription');
    
    const name = nameInput.value.trim();
    
    if (!name) {
      this.showToast('Please enter a session name', 'error');
      return;
    }
    
    try {
      const session = await this.sessionManager.createSession(
        name,
        descInput.value.trim()
      );
      
      if (this.pendingTabsData && this.pendingTabsData.length > 0) {
        session.tabs = this.pendingTabsData;
        session.tabCount = this.pendingTabsData.length;
        
        await this.sessionManager.updateSession(session.id, {
          tabs: this.pendingTabsData,
          tabCount: this.pendingTabsData.length
        });
        
        this.pendingTabsData = null;
        
        this.showToast(`✓ Session "${name}" created with ${session.tabCount} tabs`, 'success');
      } else {
        this.showToast(`✓ Session "${name}" created`, 'success');
      }
      
      this.sessions.unshift(session);
      this.renderSessions();
      this.closeSessionModal();
      
    } catch (error) {
      console.error('Create session error:', error);
      this.showToast('Failed to create session', 'error');
    }
  }

  async deleteSession(sessionId) {
    if (!confirm('Delete this session? This cannot be undone.')) {
      return;
    }
    
    try {
      await this.sessionManager.deleteSession(sessionId);
      this.sessions = this.sessions.filter(s => s.id !== sessionId);
      this.renderSessions();
      this.showToast('Session deleted', 'success');
    } catch (error) {
      console.error('Delete session error:', error);
      this.showToast('Failed to delete session', 'error');
    }
  }

  viewSession(session) {
    this.currentSession = session;
    
    if (session.tabs && session.tabs.length > 0) {
      const message = `Session: ${session.name}\n${session.tabs.length} saved tabs\n${session.items?.length || 0} clipboard items\n\nRestore tabs now?`;
      
      if (confirm(message)) {
        this.restoreSessionTabs(session);
      }
    }
    
    this.filteredItems = session.items || [];
    this.renderFilteredItems();
    this.showToast(`Viewing session: ${session.name}`, 'success');
  }

  async restoreSessionTabs(session) {
    if (!session.tabs || session.tabs.length === 0) {
      this.showToast('No tabs to restore', 'error');
      return;
    }
    
    try {
      for (const tabData of session.tabs) {
        await chrome.tabs.create({ url: tabData.url, active: false });
      }
      
      this.showToast(`✓ Restored ${session.tabs.length} tabs`, 'success');
    } catch (error) {
      console.error('Restore tabs error:', error);
      this.showToast('Failed to restore tabs', 'error');
    }
  }

  async addItemToSession(itemId) {
    if (this.sessions.length === 0) {
      this.showToast('Create a session first', 'error');
      this.openSessionModal();
      return;
    }
    
    this.showSessionSelector(itemId);
  }

  showSessionSelector(itemId) {
    const item = this.allItems.find(i => i.id === itemId);
    if (!item) return;
    
    const selector = document.createElement('div');
    selector.className = 'session-selector';
    selector.style.position = 'fixed';
    selector.style.top = '50%';
    selector.style.left = '50%';
    selector.style.transform = 'translate(-50%, -50%)';
    
    this.sessions.forEach(session => {
      const option = document.createElement('div');
      option.className = 'session-selector-item';
      option.textContent = session.name;
      
      option.addEventListener('click', async () => {
        await this.saveItemToSession(itemId, session.id);
        selector.remove();
      });
      
      selector.appendChild(option);
    });
    
    document.body.appendChild(selector);
    
    setTimeout(() => {
      document.addEventListener('click', function closeSelector(e) {
        if (!selector.contains(e.target)) {
          selector.remove();
          document.removeEventListener('click', closeSelector);
        }
      });
    }, 100);
  }

  async saveItemToSession(itemId, sessionId) {
    try {
      const item = this.allItems.find(i => i.id === itemId);
      if (!item) return;
      
      await this.sessionManager.addItemToSession(sessionId, item);
      await this.storage.markItemAsSaved(itemId);
      
      item.saved = true;
      item.expiresAt = null;
      
      const itemEl = document.querySelector(`[data-id="${itemId}"]`);
      if (itemEl) {
        itemEl.classList.add('is-saved');
        
        const saveBtn = itemEl.querySelector('.history-item-save');
        if (saveBtn) {
          saveBtn.classList.add('is-saved');
          saveBtn.title = 'Already saved to session';
          saveBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
          `;
        }
        
        const titleEl = itemEl.querySelector('.history-item-title');
        if (titleEl && !titleEl.classList.contains('item-saved')) {
          titleEl.classList.add('item-saved');
        }
      }
      
      const session = this.sessions.find(s => s.id === sessionId);
      this.showToast(`✓ Saved to "${session.name}" (won't expire)`, 'success');
      
      await this.loadSessions();
    } catch (error) {
      console.error('Save to session error:', error);
      this.showToast('Failed to add to session', 'error');
    }
  }

  async saveCurrentTabsAsSession() {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      
      const validTabs = tabs.filter(tab => 
        tab.url && 
        !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://')
      );

      if (validTabs.length === 0) {
        this.showToast('No valid tabs to save', 'error');
        return;
      }
      
      const date = new Date().toLocaleDateString();
      const suggestedName = `Research Session - ${date}`;
      
      document.getElementById('sessionName').value = suggestedName;
      document.getElementById('sessionDescription').value = 
        `${validTabs.length} tabs saved on ${date}`;
      
      this.pendingTabsData = validTabs.map(tab => ({
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl
      }));
      
      this.openSessionModal();
      
    } catch (error) {
      console.error('Save tabs error:', error);
      this.showToast('Failed to save tabs', 'error');
    }
  }

  async groupOpenTabs() {
    const progressDiv = document.getElementById('groupingProgress');
    const progressTitle = document.getElementById('progressTitle');
    const progressSubtitle = document.getElementById('progressSubtitle');
    const progressFill = document.getElementById('progressFill');
    
    try {
      progressDiv.classList.remove('hidden');
      progressTitle.textContent = 'Analyzing tabs...';
      progressSubtitle.textContent = 'Loading tab contents';
      progressFill.style.width = '20%';
      
      const tabs = await chrome.tabs.query({ currentWindow: true });
      
      progressTitle.textContent = `Analyzing ${tabs.length} tabs...`;
      progressSubtitle.textContent = 'Extracting topics with AI';
      progressFill.style.width = '40%';
      
      const groups = await this.tabGrouper.groupOpenTabs();
      
      progressTitle.textContent = 'Creating groups...';
      progressSubtitle.textContent = `Found ${groups.length} topics`;
      progressFill.style.width = '80%';
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      progressFill.style.width = '100%';
      progressTitle.textContent = '✓ Tabs grouped!';
      progressSubtitle.textContent = `Created ${groups.length} topic-based groups`;
      
      setTimeout(() => {
        progressDiv.classList.add('hidden');
        progressFill.style.width = '0%';
      }, 2000);
      
      this.showToast(`✓ Created ${groups.length} groups by topic!`, 'success');
    } catch (error) {
      console.error('Tab grouping error:', error);
      progressDiv.classList.add('hidden');
      this.showToast('Failed to group tabs', 'error');
    }
  }

  async saveTranslateLanguage(lang) {
    try {
      await chrome.storage.local.set({ translate_language: lang });
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  }

  async loadTranslateLanguage() {
    try {
      const result = await chrome.storage.local.get('translate_language');
      const savedLang = result.translate_language || 'es';
      this.selectedTranslateLang = savedLang;
      
      const langSelect = document.getElementById('translateLang');
      if (langSelect) {
        langSelect.value = savedLang;
      }
    } catch (error) {
      console.error('Failed to load language preference:', error);
    }
  }

  getLanguageName(code) {
    const languages = {
      'es': 'Spanish',
      'en': 'English',
      'ja': 'Japanese',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'hi': 'Hindi'
    };
    return languages[code] || code;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  truncate(str, length) {
    return str.length > length ? str.substring(0, length) + '...' : str;
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
}

new SidePanelManager();
