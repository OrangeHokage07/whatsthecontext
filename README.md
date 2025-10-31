# What's the Context

**What’s the Context** is a Chrome extension that transforms how researchers, students, and knowledge workers gather and organize information online.  
Built on **Chrome for Developers’ experimental Gemini Nano AI**—which runs entirely **on-device** for privacy—this extension serves as an intelligent research companion that understands **what you copy, why it matters,** and **how it connects** to your broader goals.

---

## Inspiration

Modern research workflows are messy and fragmented:

- **Tab Overload:** 50+ tabs across multiple topics.  
- **Context Loss:** Copied text without attribution or intent.  
- **Session Discontinuity:** Research state lost on browser restart.  
- **Manual Organization:** Tedious sorting and categorization.

We envisioned a smarter browser experience—one that **remembers context**, **preserves intent**, and **organizes knowledge seamlessly**.

---

## What It Does

### Intelligent Clipboard Management
- Captures copied text automatically with **source URL**, **title**, and **timestamp**.
- Detects both manual copies and page highlights.
- Provides real-time search, filtering, and visual distinction between copy types.
- Unsaved items auto-expire after **3 days**, while saved session items persist indefinitely.

### AI-Powered Text Processing (On-Device via Gemini Nano)
- **Summarize:** Condense long passages intelligently.  
- **Rephrase:** Rewrite for clarity or originality.  
- **Proofread:** Fix grammar and spelling without changing tone.  
- **Translate:** Support for 10 major languages with persistent preferences.

### Semantic Tab Grouping
- Analyzes open tabs using AI to identify **main subjects**.
- Clusters similar topics (e.g., *Formula 1* vs. *Formula E*).
- Creates descriptive Chrome tab groups with visual colors.
- Groups across **different domains** (e.g., GitHub, Stack Overflow, Medium).

### Research Session Management
- Save entire browser sessions (tabs + clipboard data).  
- Name, view, and restore research sessions anytime.  
- Add specific items to sessions for permanent storage.  
- Export/import capabilities planned for future versions.

### Multi-Color Highlighting
- 5 color options: Yellow | Green | Blue | Pink | Gold  
- Highlights persist across sessions and refreshes.  
- Simple floating toolbar with click-to-remove functionality.

---

##  How We Built It

### Core Architecture
```
smart-copy-extension/
├── manifest.json # Manifest V3 configuration
├── background/
│ └── service-worker.js # Background event handling
├── content/
│ ├── content-script.js # Page interaction logic
│ └── content-styles.css # Injected styles
├── sidepanel/
│ ├── sidepanel.html # Main UI
│ ├── sidepanel.js # State management + AI actions
│ └── sidepanel.css # Styling
├── popup/
│ ├── popup.html # Optional quick menu
│ └── popup.js
├── utils/
│ ├── storage.js # Storage abstraction layer
│ ├── ai-processor.js # Gemini Nano integration
│ ├── session-manager.js # Session handling
│ ├── tab-grouper.js # AI tab grouping logic
│ └── context-manager.js # Page context extraction
└── icons/ # App icons (16/48/128px)
```

### Component Communication
**Clipboard Flow**
User copies text
↓
content-script.js captures selection
↓
chrome.runtime.sendMessage → service-worker.js
↓
Stored in chrome.storage.local
↓
sidepanel.js updates UI in real-time


**AI Flow**
User clicks "Summarize"
↓
ai-processor.js opens Gemini Nano session
↓
Sends prompt → receives processed text
↓
Result copied to clipboard + displayed in side panel


**Tab Grouping Flow**
User clicks "Group Tabs"
↓
Extracts tab titles + text → AI identifies subjects
↓
Tabs clustered by semantic similarity
↓
Chrome tab groups auto-created + color-coded

---

##  Technology Stack

| Technology | Purpose |
|-------------|----------|
| **JavaScript (ES6+)** | Core logic |
| **HTML5 / CSS3** | UI structure and styling |
| **Chrome Extension API (MV3)** | Browser integration |
| **Gemini Nano (Experimental)** | On-device AI text processing |

### Chrome APIs Used
- `chrome.storage.local` — Persistent data (10MB quota)
- `chrome.sidePanel` — Extension UI
- `chrome.alarms` — Background cleanup
- `chrome.tabs` / `chrome.tabGroups` — Tab operations
- `chrome.runtime.sendMessage` — Cross-component messaging
- `chrome.scripting.executeScript` — Dynamic content extraction

---

## Gemini Nano Setup

>  One-time setup required before enabling AI features.

### Step 1 — Enable Flags
1. Go to `chrome://flags`
2. Enable the following:
   - `Optimization Guide On Device Model` → **Enabled BypassPerfRequirement**
   - `Prompt API for Gemini Nano` → **Enabled**
3. Restart Chrome.

### Step 2 — Verify and Download Model
Open DevTools Console and run:
```js
(async () => {
  const status = await ai.languageModel.capabilities();
  console.log('AI Status:', status);
})();
If status = downloadable, Chrome will fetch the ~1.5 GB model automatically (takes 5–15 min).

Re-run the check until status = available.

Step 3 — Confirm Functionality

(async () => {
  const session = await ai.languageModel.create();
  const result = await session.prompt("Hello");
  console.log('Response:', result);
})();
```
Installation
```
git clone https://github.com/yourusername/whats-the-context.git
cd whats-the-context
```
Open chrome://extensions/
Toggle Developer Mode (top-right)
Click Load unpacked
Select the project folder
Verify the extension loads successfully

Usage Guide
1. Capturing Text
Select text → Press Ctrl+C / Cmd+C
Captured automatically with source URL and timestamp.

2. Highlighting
Select text → Choose color from floating toolbar.
Persistent across refreshes. Click to remove.

3. AI Actions
Open the side panel → click any item → choose:
Summarize
Rephrase
Proofread
Translate
Processing time: 2–20 seconds depending on text length.

4. Research Sessions
“Save Tabs” → Create named session with all open tabs.
“Add to Session” → Attach clipboard items to a session.
Sessions persist indefinitely and can be restored anytime.

5. Group Tabs
Click Group Tabs
AI analyzes open tabs and clusters by topic.

```
Data Models

{
  id: string,
  text: string,
  sourceUrl: string,
  sourceTitle: string,
  timestamp: ISO8601,
  type: 'copy' | 'highlight',
  color: string,
  saved: boolean,
  expiresAt: ISO8601 | null
}
Research Session

{
  id: string,
  name: string,
  description: string,
  createdAt: ISO8601,
  updatedAt: ISO8601,
  items: ClipboardItem[],
  tabs: Array<{ title, url, favIconUrl }>,
  contexts: Context[],
  tags: string[]
}
Tab Group

{
  name: string,
  tabs: ChromeTab[],
  topic: string
}
```
Challenges We Ran Into:
- Integrating Gemini Nano within Manifest V3 restrictions.
- Ensuring real-time clipboard capture without interfering with user copy behavior.
- Managing persistent highlights across sessions efficiently.
- Designing a fast, lightweight AI processing layer under Chrome’s local storage constraints.

Accomplishments We’re Proud Of:
- Fully on-device AI integration — zero data leaves the user’s machine.
- Seamless real-time clipboard tracking with auto attribution.
- Beautifully designed side panel UI for distraction-free research.
- Scalable architecture ready for cloud-sync and collaboration in future.

What We Learned:
- Working with Gemini Nano and the Chrome Dev experimental APIs.
- Designing asynchronous, reactive systems with Service Workers and Side Panels.
- Managing privacy-first AI workflows entirely on-device.
- The art of merging usability, context-awareness, and AI intelligence.

What’s Next for What’s the Context:
- Cloud Sync between devices.
- Collaborative Sessions for group research.
- Context Graphs — visualize knowledge connections.
- Export/Import Sessions (JSON/Markdown formats).
- Custom AI Models integration for domain-specific research.

Development & Testing
Development Setup
git clone https://github.com/yourusername/whats-the-context.git
cd whats-the-context
No dependencies — pure JavaScript.

Testing Checklist
- Clipboard capture working
- AI processing available
- Highlights persist across reloads
- Sessions save/restore correctly
- Tab grouping performs within 20 s

Debugging Shortcuts
Service Worker Console: chrome://extensions/ → click service worker link
Content Script Console: Inspect any webpage (F12)
Side Panel Console: Right-click inside panel → “Inspect”

Contributors
Pratyush Tiwary — Project Lead & Developer
Manan Bhutiani — Pipeline Manager & Full-Stack Developer
Saswat Sharma — Prompt Engineer & Troubleshoot Handler

License
This project is licensed under the MIT License — feel free to fork, modify, and build upon it with attribution.
