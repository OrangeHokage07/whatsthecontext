export class AIProcessor {
  constructor() {
    this.isReady = false;
    this.capabilities = {
      languageModel: false
    };
    this.cachedSession = null;
  }

  async initialize() {
    try {
      if (typeof LanguageModel === 'undefined' || !LanguageModel) {
        console.warn('LanguageModel API not available');
        return;
      }

      const availability = await LanguageModel.availability();
      
      if (availability === 'available' || availability === 'readily') {
        this.capabilities.languageModel = true;
        this.isReady = true;
        await this.getSession();
        console.log('✅ Gemini Nano ready with cached session');
      } else if (availability === 'downloading') {
        console.log('⏳ Model downloading...');
      } else {
        console.log('❌ Model not available:', availability);
      }
    } catch (error) {
      console.error('AI initialization error:', error);
    }
  }

  async getSession() {
    if (!this.cachedSession) {
      this.cachedSession = await LanguageModel.create({
        language: 'en',
        temperature: 0.5,
        topK: 1
      });
    }
    return this.cachedSession;
  }

  async destroySession() {
    if (this.cachedSession) {
      await this.cachedSession.destroy();
      this.cachedSession = null;
    }
  }

  async summarize(text) {
    if (!this.isReady) {
      return this.fallbackSummarize(text);
    }

    try {
      const truncatedText = text.length > 1000 ? text.substring(0, 1000) + '...' : text;
      const session = await this.getSession();
      const prompt = `Summarize briefly:\n${truncatedText}`;
      const result = await session.prompt(prompt);
      return result.trim();
    } catch (error) {
      console.error('Summarization error:', error);
      return this.fallbackSummarize(text);
    }
  }

  async rephrase(text) {
    if (!this.isReady) {
      return this.cleanText(text);
    }

    try {
      const truncatedText = text.length > 800 ? text.substring(0, 800) + '...' : text;
      const session = await this.getSession();
      const prompt = `Rephrase:\n${truncatedText}`;
      const result = await session.prompt(prompt);
      return result.trim();
    } catch (error) {
      console.error('Rephrase error:', error);
      return this.cleanText(text);
    }
  }

  async proofread(text) {
    if (!this.isReady) {
      return this.cleanText(text);
    }

    try {
      const truncatedText = text.length > 800 ? text.substring(0, 800) + '...' : text;
      const session = await this.getSession();
      const prompt = `Fix errors:\n${truncatedText}`;
      const result = await session.prompt(prompt);
      return result.trim();
    } catch (error) {
      console.error('Proofread error:', error);
      return this.cleanText(text);
    }
  }

  async translate(text, targetLang = 'es') {
    if (!this.isReady) {
      throw new Error('Translation requires AI model');
    }

    try {
      const truncatedText = text.length > 600 ? text.substring(0, 600) + '...' : text;
      
      const langNames = {
        'en': 'English',
        'es': 'Spanish',
        'ja': 'Japanese',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'zh': 'Chinese',
        'ar': 'Arabic',
        'hi': 'Hindi'
      };

      const session = await this.getSession();
      const prompt = `Translate this text to ${langNames[targetLang] || targetLang}:\n\n${truncatedText}`;
      const result = await session.prompt(prompt);
      return result.trim();
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error(`Translation to ${targetLang} failed. Try a different language.`);
    }
  }

  fallbackSummarize(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const summary = sentences.slice(0, Math.min(3, sentences.length)).join(' ');
    return summary.length > 300 ? summary.substring(0, 297) + '...' : summary;
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  async checkAvailability() {
    try {
      if (typeof LanguageModel === 'undefined' || !LanguageModel) {
        return 'unavailable';
      }
      return await LanguageModel.availability();
    } catch (error) {
      return 'unavailable';
    }
  }
}
