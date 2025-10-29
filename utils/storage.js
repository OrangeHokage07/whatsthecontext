export class StorageManager {
  constructor() {
    this.storageKey = 'smartcopy_items';
    this.maxItems = 100;
  }

  async initialize() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      if (!result[this.storageKey]) {
        await chrome.storage.local.set({ [this.storageKey]: [] });
      }
    } catch (error) {
      console.error('Storage initialization error:', error);
      throw error;
    }
  }

  async getAllItems() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey] || [];
    } catch (error) {
      console.error('Get items error:', error);
      return [];
    }
  }

  async addClipboardItem(item) {
    try {
      if (!item || !item.text || typeof item.text !== 'string') {
        throw new Error('Invalid clipboard item');
      }

      if (!item.saved && !item.expiresAt) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 3);
        item.expiresAt = expiry.toISOString();
      }

      const items = await this.getAllItems();
      items.unshift(item);
      
      if (items.length > this.maxItems) {
        items.splice(this.maxItems);
      }
      
      await chrome.storage.local.set({ [this.storageKey]: items });
      return item;
    } catch (error) {
      console.error('Add item error:', error);
      throw error;
    }
  }

  async markItemAsSaved(itemId) {
    try {
      const items = await this.getAllItems();
      const item = items.find(i => i.id === itemId);
      
      if (item) {
        item.saved = true;
        item.expiresAt = null;
        await chrome.storage.local.set({ [this.storageKey]: items });
      }
      
      return item;
    } catch (error) {
      console.error('Mark as saved error:', error);
      throw error;
    }
  }

  async deleteItem(id) {
    try {
      const items = await this.getAllItems();
      const filtered = items.filter(item => item.id !== id);
      await chrome.storage.local.set({ [this.storageKey]: filtered });
      return true;
    } catch (error) {
      console.error('Delete item error:', error);
      throw error;
    }
  }

  async clearAll() {
    try {
      await chrome.storage.local.set({ [this.storageKey]: [] });
      return true;
    } catch (error) {
      console.error('Clear all error:', error);
      throw error;
    }
  }

  async cleanupOldItems(daysToKeep = 7) {
    try {
      const items = await this.getAllItems();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const filtered = items.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate > cutoffDate;
      });
      
      if (filtered.length !== items.length) {
        await chrome.storage.local.set({ [this.storageKey]: filtered });
        console.log(`Cleaned up ${items.length - filtered.length} old items`);
      }
      
      return filtered.length;
    } catch (error) {
      console.error('Cleanup error:', error);
      return 0;
    }
  }

  async getStorageStats() {
    try {
      const items = await this.getAllItems();
      const totalSize = JSON.stringify(items).length;
      
      return {
        itemCount: items.length,
        totalSize: totalSize,
        sizeInKB: (totalSize / 1024).toFixed(2),
        maxItems: this.maxItems
      };
    } catch (error) {
      console.error('Stats error:', error);
      return null;
    }
  }
}
