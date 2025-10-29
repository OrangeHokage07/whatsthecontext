document.getElementById('openSidePanel').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  } catch (error) {
    console.error('Failed to open side panel:', error);
    await chrome.tabs.create({ url: 'sidepanel/sidepanel.html' });
    window.close();
  }
});

document.getElementById('openInTab').addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'sidepanel/sidepanel.html' });
  window.close();
});
async function loadStats() {
  try {
    const result = await chrome.storage.local.get('smartcopy_items');
    const items = result.smartcopy_items || [];
    document.getElementById('itemCount').textContent = items.length;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

loadStats();
