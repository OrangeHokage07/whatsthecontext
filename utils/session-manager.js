export class SessionManager {
  constructor() {
    this.storageKey = 'smartcopy_sessions';
  }

  async initialize() {
    const result = await chrome.storage.local.get(this.storageKey);
    if (!result[this.storageKey]) {
      await chrome.storage.local.set({ [this.storageKey]: [] });
    }
  }

  async createSession(name, description = '') {
    const session = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [],
      contexts: [],
      tags: []
    };

    const sessions = await this.getAllSessions();
    sessions.unshift(session);
    
    await chrome.storage.local.set({ [this.storageKey]: sessions });
    return session;
  }

  async getAllSessions() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey] || [];
    } catch (error) {
      console.error('Get sessions error:', error);
      return [];
    }
  }

  async getSession(sessionId) {
    const sessions = await this.getAllSessions();
    return sessions.find(s => s.id === sessionId);
  }

  async addItemToSession(sessionId, item) {
    const sessions = await this.getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.items.find(i => i.id === item.id)) {
      session.items.push({
        ...item,
        addedToSessionAt: new Date().toISOString()
      });
      session.updatedAt = new Date().toISOString();
      
      await chrome.storage.local.set({ [this.storageKey]: sessions });
    }

    return session;
  }

  async addContextToSession(sessionId, context) {
    const sessions = await this.getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.contexts.find(c => c.id === context.id)) {
      session.contexts.push({
        ...context,
        addedToSessionAt: new Date().toISOString()
      });
      session.updatedAt = new Date().toISOString();
      
      await chrome.storage.local.set({ [this.storageKey]: sessions });
    }

    return session;
  }

  async removeItemFromSession(sessionId, itemId) {
    const sessions = await this.getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    session.items = session.items.filter(i => i.id !== itemId);
    session.updatedAt = new Date().toISOString();
    
    await chrome.storage.local.set({ [this.storageKey]: sessions });
    return session;
  }

  async deleteSession(sessionId) {
    const sessions = await this.getAllSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    
    await chrome.storage.local.set({ [this.storageKey]: filtered });
    return true;
  }

  async updateSession(sessionId, updates) {
    const sessions = await this.getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    Object.assign(session, updates, {
      updatedAt: new Date().toISOString()
    });
    
    await chrome.storage.local.set({ [this.storageKey]: sessions });
    return session;
  }

  async exportSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const exported = {
      ...session,
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(exported, null, 2);
  }
}
