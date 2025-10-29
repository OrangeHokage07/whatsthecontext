export class ContextManager {
  constructor() {
    this.currentPageContext = null;
    this.storageKey = 'smartcopy_contexts';
  }

  async initialize() {
    await this.cleanupExpiredContexts();
  }

  async capturePageContext(text = '', manual = false) {
    const context = {
      id: Date.now().toString(),
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
      timestamp: new Date().toISOString(),
      snippet: text || this.extractPageSnippet(),
      summary: null,
      saved: manual,
      expiresAt: manual ? null : this.getExpiryDate()
    };

    try {
      if (typeof LanguageModel !== 'undefined') {
        const availability = await LanguageModel.availability();
        if (availability === 'available') {
          context.summary = await this.generateSummary(context.snippet);
        }
      }
    } catch (error) {
      console.log('AI summary not available:', error);
    }

    await this.saveContext(context);
    this.currentPageContext = context;
    return context;
  }

  extractPageSnippet() {
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    const content = article || main || document.body;
    
    const text = content.innerText || content.textContent || '';
    return text.substring(0, 500).trim();
  }

  async generateSummary(text) {
    try {
      const session = await LanguageModel.create({
        language: 'en',
        temperature: 0.3,
        topK: 1
      });

      const truncated = text.substring(0, 400);
      const prompt = `In 2 sentences, what is this page about:\n${truncated}`;
      const result = await session.prompt(prompt);
      
      await session.destroy();
      return result.trim();
    } catch (error) {
      console.error('Summary generation failed:', error);
      return null;
    }
  }

  getExpiryDate() {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString();
  }

  async saveContext(context) {
    try {
      const contexts = await this.getAllContexts();
      
      const existingIndex = contexts.findIndex(c => c.url === context.url);
      
      if (existingIndex >= 0) {
        contexts[existingIndex] = context;
      } else {
        contexts.unshift(context);
      }

      if (contexts.length > 100) {
        contexts.length = 100;
      }

      await chrome.storage.local.set({ [this.storageKey]: contexts });
      return context;
    } catch (error) {
      console.error('Save context error:', error);
      throw error;
    }
  }

  async getAllContexts() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey] || [];
    } catch (error) {
      console.error('Get contexts error:', error);
      return [];
    }
  }

  async getContextForUrl(url) {
    const contexts = await this.getAllContexts();
    return contexts.find(c => c.url === url);
  }

  async markContextAsSaved(contextId) {
    const contexts = await this.getAllContexts();
    const context = contexts.find(c => c.id === contextId);
    
    if (context) {
      context.saved = true;
      context.expiresAt = null;
      await chrome.storage.local.set({ [this.storageKey]: contexts });
    }
  }

  async cleanupExpiredContexts() {
    try {
      const contexts = await this.getAllContexts();
      const now = new Date();
      
      const active = contexts.filter(context => {
        if (context.saved) return true;
        if (!context.expiresAt) return true;
        
        const expiryDate = new Date(context.expiresAt);
        return expiryDate > now;
      });

      if (active.length !== contexts.length) {
        await chrome.storage.local.set({ [this.storageKey]: active });
        console.log(`Cleaned up ${contexts.length - active.length} expired contexts`);
      }

      return active.length;
    } catch (error) {
      console.error('Cleanup error:', error);
      return 0;
    }
  }
}
