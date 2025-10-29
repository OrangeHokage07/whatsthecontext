const STORAGE_KEY = 'smartcopy_items';
const MAX_ITEMS = 100;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openSidePanel') {
    handleOpenSidePanel(sender.tab).then(sendResponse);
    return true;
  }
  
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleOpenSidePanel(tab) {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    return { success: true };
  } catch (error) {
    console.error('Failed to open side panel:', error);
    try {
      await chrome.tabs.create({ url: 'sidepanel/sidepanel.html' });
      return { success: true, fallback: true };
    } catch (e) {
      return { success: false, error: error.message };
    }
  }
}

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {
      case 'copyText':
        await handleCopyText(message.data, sender.tab);
        sendResponse({ success: true });
        break;

      case 'highlightText':
        await handleHighlightText(message.data, sender.tab);
        sendResponse({ success: true });
        break;

      case 'captureContext':
        await handleCaptureContext(message.data);
        sendResponse({ success: true });
        break;

      case 'getClipboardItems':
        const items = await getAllItems();
        sendResponse({ success: true, data: items });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Service worker error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCopyText(data, tab) {
  if (!data.text || data.text.trim().length === 0) {
    throw new Error('Empty text cannot be copied');
  }

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 3);

  const clipboardItem = {
    id: Date.now().toString(),
    text: data.text.trim(),
    sourceUrl: tab?.url || 'unknown',
    sourceTitle: tab?.title || 'Untitled',
    timestamp: new Date().toISOString(),
    highlighted: false,
    type: 'copy',
    saved: false,
    expiresAt: expiry.toISOString()
  };

  await addClipboardItem(clipboardItem);
  
  chrome.runtime.sendMessage({
    action: 'clipboardUpdated',
    data: clipboardItem
  }).catch(() => {});
}

async function handleHighlightText(data, tab) {
  if (!data.text || data.text.trim().length === 0) {
    throw new Error('Empty text cannot be highlighted');
  }

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 3);

  const highlightItem = {
    id: Date.now().toString(),
    text: data.text.trim(),
    color: data.color || '#ffff00',
    sourceUrl: tab?.url || 'unknown',
    sourceTitle: tab?.title || 'Untitled',
    timestamp: new Date().toISOString(),
    highlighted: true,
    type: 'highlight',
    range: data.range,
    saved: false,
    expiresAt: expiry.toISOString()
  };

  await addClipboardItem(highlightItem);
  
  chrome.runtime.sendMessage({
    action: 'clipboardUpdated',
    data: highlightItem
  }).catch(() => {});
}

async function handleCaptureContext(data) {
  try {
    const contexts = await chrome.storage.local.get('smartcopy_contexts');
    const contextList = contexts.smartcopy_contexts || [];
    
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 3);
    
    const context = {
      id: Date.now().toString(),
      url: data.url,
      title: data.title,
      snippet: data.snippet,
      timestamp: new Date().toISOString(),
      saved: false,
      expiresAt: expiry.toISOString()
    };
    
    contextList.unshift(context);
    if (contextList.length > 100) {
      contextList.length = 100;
    }
    
    await chrome.storage.local.set({ smartcopy_contexts: contextList });
  } catch (error) {
    console.error('Context capture error:', error);
  }
}

async function getAllItems() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  } catch (error) {
    console.error('Get items error:', error);
    return [];
  }
}

async function addClipboardItem(item) {
  try {
    if (!item || !item.text || typeof item.text !== 'string') {
      throw new Error('Invalid clipboard item');
    }

    const items = await getAllItems();
    items.unshift(item);
    
    if (items.length > MAX_ITEMS) {
      items.splice(MAX_ITEMS);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEY]: items });
    return item;
  } catch (error) {
    console.error('Add item error:', error);
    throw error;
  }
}

async function initialize() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (!result[STORAGE_KEY]) {
      await chrome.storage.local.set({ [STORAGE_KEY]: [] });
    }
  } catch (error) {
    console.error('Storage initialization error:', error);
  }
}

async function cleanupExpiredItems() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const items = result[STORAGE_KEY] || [];
    const now = new Date();
    
    const active = items.filter(item => {
      if (item.saved) return true;
      if (!item.expiresAt) {
        const created = new Date(item.timestamp);
        const expiry = new Date(created);
        expiry.setDate(expiry.getDate() + 3);
        item.expiresAt = expiry.toISOString();
      }
      
      const expiryDate = new Date(item.expiresAt);
      return expiryDate > now;
    });

    if (active.length !== items.length) {
      await chrome.storage.local.set({ [STORAGE_KEY]: active });
      console.log(`Cleaned up ${items.length - active.length} expired items`);
    }
  } catch (error) {
    console.error('Cleanup items error:', error);
  }
}

async function cleanupExpiredContexts() {
  try {
    const result = await chrome.storage.local.get('smartcopy_contexts');
    const contexts = result.smartcopy_contexts || [];
    const now = new Date();
    
    const active = contexts.filter(context => {
      if (context.saved) return true;
      if (!context.expiresAt) return true;
      
      const expiryDate = new Date(context.expiresAt);
      return expiryDate > now;
    });

    if (active.length !== contexts.length) {
      await chrome.storage.local.set({ smartcopy_contexts: active });
      console.log(`Cleaned up ${contexts.length - active.length} expired contexts`);
    }
  } catch (error) {
    console.error('Cleanup contexts error:', error);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await initialize();
  console.log('SmartCopy extension installed successfully');
});

chrome.alarms.create('cleanupExpired', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanupExpired') {
    await cleanupExpiredItems();
    await cleanupExpiredContexts();
  }
});

async function updateBadge() {
  try {
    const items = await getAllItems();
    const count = items.length;
    
    if (count > 0) {
      chrome.action.setBadgeText({ text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('Badge update error:', error);
  }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes[STORAGE_KEY]) {
    updateBadge();
  }
});

updateBadge();
