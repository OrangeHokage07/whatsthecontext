export class TabGrouper {
  constructor() {
    this.sessionCache = null;
    this.similarityThreshold = 0.6;
  }

  async groupOpenTabs() {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });

      const validTabs = tabs.filter(tab => 
        tab.url && 
        !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://') &&
        !tab.url.startsWith('edge://') &&
        !tab.url.startsWith('about:')
      );

      if (validTabs.length === 0) {
        throw new Error('No valid tabs to group (all are system pages)');
      }

      const tabContents = await this.extractTabContents(validTabs);
      
      if (tabContents.length === 0) {
        throw new Error('Could not extract content from any tabs');
      }

      const groups = await this.generateSemanticGroups(tabContents);
      await this.applyTabGroups(groups);
      
      return groups;
    } catch (error) {
      console.error('Tab grouping error:', error);
      throw error;
    }
  }

  async extractTabContents(tabs) {
    const contents = [];
    
    for (const tab of tabs) {
      try {
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          console.log(`Skipping system tab: ${tab.title}`);
          continue;
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            try {
              const article = document.querySelector('article');
              const main = document.querySelector('main');
              const content = article || main || document.body;
              
              const headings = Array.from(document.querySelectorAll('h1, h2'))
                .map(h => h.textContent.trim())
                .filter(text => text.length > 0)
                .join(' ');
              
              const text = content.innerText || content.textContent || '';
              
              return {
                title: document.title || 'Untitled',
                headings: headings,
                text: text.substring(0, 500).trim(),
                url: window.location.href
              };
            } catch (error) {
              return {
                title: document.title || 'Untitled',
                headings: '',
                text: '',
                url: window.location.href,
                error: error.message
              };
            }
          }
        });

        if (results && results[0] && results[0].result) {
          const result = results[0].result;

          if (result.title || result.text || result.headings) {
            contents.push({
              tab: tab,
              title: result.title,
              headings: result.headings,
              text: result.text || result.title || 'No content',
              url: result.url,
              topic: null
            });
            console.log(`✓ Extracted: ${result.title}`);
          }
        }
      } catch (error) {
        console.warn(`Failed to extract content from tab ${tab.id} (${tab.title}):`, error.message);

        contents.push({
          tab: tab,
          title: tab.title || 'Untitled',
          headings: '',
          text: tab.title || 'Unknown content',
          url: tab.url,
          topic: null
        });
      }
    }

    console.log(`Successfully extracted content from ${contents.length} tabs`);
    return contents;
  }

  async generateSemanticGroups(tabContents) {
    try {
      if (typeof LanguageModel === 'undefined') {
        console.log('AI not available, using fallback grouping');
        return this.fallbackGrouping(tabContents);
      }

      const availability = await LanguageModel.availability();
      if (availability !== 'available' && availability !== 'readily') {
        console.log('AI model not ready, using fallback grouping');
        return this.fallbackGrouping(tabContents);
      }

const session = await LanguageModel.create({
  language: 'en',
  outputLanguage: 'en', 
  temperature: 0.3,
  topK: 1
});


      console.log('🔍 Analyzing tab topics...');
      
      for (const content of tabContents) {
        try {
          content.topic = await Promise.race([
            this.extractTopic(session, content),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 10000)
            )
          ]);
        } catch (error) {
          console.warn(`Topic extraction failed for "${content.title}":`, error.message);
          content.topic = content.title.substring(0, 50);
        }
      }

      const clusters = await this.clusterByTopics(session, tabContents);
      await session.destroy();

      console.log('✅ Found', clusters.length, 'topic groups');
      return clusters;

    } catch (error) {
      console.error('AI grouping failed:', error);
      return this.fallbackGrouping(tabContents);
    }
  }

  async extractTopic(session, content) {
    try {
      const context = `
Title: ${content.title}
Headings: ${content.headings || 'None'}
Content: ${content.text.substring(0, 300)}
`.trim();

      const prompt = `In 3-5 words, what is the SPECIFIC topic of this webpage? Be precise.

${context}

Topic:`;

      const result = await session.prompt(prompt);
      const topic = result.trim();
      
      console.log(`📄 ${content.title.substring(0, 40)} → Topic: ${topic}`);
      return topic;
    } catch (error) {
      console.error('Topic extraction failed:', error);
      return content.title.substring(0, 50);
    }
  }

  async clusterByTopics(session, tabContents) {
    const clusters = [];
    const processed = new Set();

    for (let i = 0; i < tabContents.length; i++) {
      if (processed.has(i)) continue;

      const baseTab = tabContents[i];
      const cluster = {
        name: baseTab.topic,
        tabs: [baseTab.tab],
        topic: baseTab.topic
      };

      for (let j = i + 1; j < tabContents.length; j++) {
        if (processed.has(j)) continue;

        const compareTab = tabContents[j];
        
        try {
          const areSimilar = await this.areTopicsSimilar(
            session,
            baseTab.topic,
            compareTab.topic
          );

          if (areSimilar) {
            cluster.tabs.push(compareTab.tab);
            processed.add(j);
          }
        } catch (error) {
          console.warn('Similarity check failed, skipping:', error.message);
        }
      }

      processed.add(i);
      
      if (cluster.tabs.length >= 1) {
        clusters.push(cluster);
      }
    }

    clusters.sort((a, b) => b.tabs.length - a.tabs.length);
    return clusters;
  }

  async areTopicsSimilar(session, topic1, topic2) {
    try {
      const similarity = this.calculateStringSimilarity(topic1, topic2);
      
      if (similarity > 0.8) return true;
      if (similarity < 0.2) return false;

      const prompt = `Are these two topics about the same specific subject? Answer only YES or NO.

Topic 1: ${topic1}
Topic 2: ${topic2}

Answer:`;

      const result = await session.prompt(prompt);
      const answer = result.trim().toUpperCase();
      
      return answer.includes('YES');
    } catch (error) {
      console.error('Similarity check failed:', error);
      return false;
    }
  }

  calculateStringSimilarity(str1, str2) {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 3));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const commonWords = [...words1].filter(word => words2.has(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  }

  fallbackGrouping(tabContents) {
    console.log('Using domain-based fallback grouping');
    const domainGroups = new Map();
    
    for (const content of tabContents) {
      try {
        const url = new URL(content.url);
        const domain = url.hostname.replace('www.', '');
        
        if (!domainGroups.has(domain)) {
          domainGroups.set(domain, []);
        }
        domainGroups.get(domain).push(content.tab);
      } catch (error) {
        console.error('URL parse error:', error);
      }
    }

    return Array.from(domainGroups.entries())
      .filter(([_, tabs]) => tabs.length > 0)
      .map(([name, tabs]) => ({ name, tabs, topic: name }));
  }

  async applyTabGroups(groups) {
    try {
      console.log('📌 Creating tab groups...');

      try {
        const existingGroups = await chrome.tabGroups.query({});
        for (const group of existingGroups) {
          try {
            const groupTabs = await chrome.tabs.query({ groupId: group.id });
            if (groupTabs.length > 0) {
              await chrome.tabs.ungroup(groupTabs.map(t => t.id));
            }
          } catch (error) {
            console.warn('Failed to ungroup existing group:', error.message);
          }
        }
      } catch (error) {
        console.warn('Failed to query existing groups:', error.message);
      }

      const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];
      let createdCount = 0;
      
      for (let i = 0; i < groups.length; i++) {
        const { name, tabs } = groups[i];
        
        if (tabs.length < 1) continue;
        
        try {
          const tabIds = tabs.map(t => t.id).filter(id => id !== undefined);
          
          if (tabIds.length === 0) {
            console.warn(`No valid tab IDs for group "${name}"`);
            continue;
          }
          
          const groupId = await chrome.tabs.group({ tabIds });
          
          const displayName = name.length > 30 ? name.substring(0, 27) + '...' : name;
          
          await chrome.tabGroups.update(groupId, {
            title: `${displayName} (${tabs.length})`,
            color: colors[i % colors.length],
            collapsed: tabs.length > 5
          });
          
          createdCount++;
          console.log(`✅ Created group "${displayName}" with ${tabs.length} tabs`);
        } catch (error) {
          console.error(`Failed to create group "${name}":`, error.message);
        }
      }

      if (createdCount === 0) {
        throw new Error('No groups were created');
      }

      console.log(`✅ Successfully created ${createdCount} groups`);
    } catch (error) {
      console.error('Apply tab groups error:', error);
      throw error;
    }
  }
}
