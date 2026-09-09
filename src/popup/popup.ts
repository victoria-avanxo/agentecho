import type { ExtensionSettings } from '../shared/types';
import { sendMessage } from '../shared/messaging';
import { formatHotkeyFromEvent } from '../shared/hotkey';

let currentTabId: number | null = null;
let isActive = false;

const toggleBtn = document.getElementById('toggleBtn') as HTMLButtonElement;
const btnText = toggleBtn?.querySelector('.btn-text') as HTMLElement;

const settingsInputs = {
  markerColor: document.getElementById('markerColor') as HTMLInputElement,
  outputDetail: document.getElementById('outputDetail') as HTMLSelectElement,
  theme: document.getElementById('theme') as HTMLSelectElement,
  clearAfterCopy: document.getElementById('clearAfterCopy') as HTMLInputElement,
  blockInteractions: document.getElementById('blockInteractions') as HTMLInputElement,
};

const hotkeyBtn = document.getElementById('toggleHotkey') as HTMLButtonElement;
let isRecordingHotkey = false;
let savedHotkey = '';

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id || null;

  if (currentTabId === null) return;

  const response = await sendMessage({ type: 'GET_STATE', tabId: currentTabId }) as { isActive: boolean };
  isActive = response.isActive;
  updateToggleButton();

  const settings = await sendMessage<ExtensionSettings>({ type: 'GET_SETTINGS' });
  loadSettings(settings);
}

function updateToggleButton() {
  if (isActive) {
    toggleBtn?.classList.add('active');
    if (btnText) btnText.textContent = 'Deactivate';
  } else {
    toggleBtn?.classList.remove('active');
    if (btnText) btnText.textContent = 'Activate';
  }
}

function loadSettings(settings: ExtensionSettings) {
  if (settingsInputs.markerColor) settingsInputs.markerColor.value = settings.markerColor;
  if (settingsInputs.outputDetail) settingsInputs.outputDetail.value = settings.outputDetail;
  if (settingsInputs.theme) settingsInputs.theme.value = settings.theme;
  if (settingsInputs.clearAfterCopy) settingsInputs.clearAfterCopy.checked = settings.clearAfterCopy;
  if (settingsInputs.blockInteractions) settingsInputs.blockInteractions.checked = settings.blockInteractions;
  savedHotkey = settings.toggleHotkey;
  if (hotkeyBtn) hotkeyBtn.textContent = savedHotkey;
}

async function saveSetting(key: keyof ExtensionSettings, value: unknown) {
  await sendMessage({
    type: 'SAVE_SETTINGS',
    settings: { [key]: value },
  });
}

toggleBtn?.addEventListener('click', async () => {
  if (currentTabId === null) return;

  const response = await sendMessage({ type: 'TOGGLE_EXTENSION', tabId: currentTabId }) as { isActive: boolean };
  isActive = response.isActive;
  updateToggleButton();

  if (isActive) {
    await activateOverlay(currentTabId);
  } else {
    chrome.tabs.sendMessage(currentTabId, { type: 'DEACTIVATE_OVERLAY' }).catch(() => {});
  }
});

/**
 * Send ACTIVATE_OVERLAY to the tab. Content scripts are only auto-injected into
 * pages loaded after the extension was loaded/reloaded, so a tab that was already
 * open (or a dev reload) has no content script and the message goes nowhere.
 * In that case, inject the content script on demand using the loader path declared
 * in the manifest, then retry — the loader's dynamic import registers the message
 * listener asynchronously, so we poll briefly until it responds.
 */
async function activateOverlay(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_OVERLAY' });
    return;
  } catch {
    // No receiving end yet — fall through to inject.
  }

  const contentScript = chrome.runtime.getManifest().content_scripts?.[0];
  if (!contentScript?.js?.length) {
    console.error('AgentEcho: no content script declared in manifest');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: contentScript.js,
    });
  } catch (e) {
    // Restricted pages (chrome://, the Web Store, PDF viewer, etc.) cannot be injected.
    console.error('AgentEcho: cannot inject into this page', e);
    return;
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_OVERLAY' });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  console.error('AgentEcho: content script never became ready');
}

settingsInputs.markerColor?.addEventListener('input', async (e) => {
  await saveSetting('markerColor', (e.target as HTMLInputElement).value);
});

settingsInputs.outputDetail?.addEventListener('change', async (e) => {
  await saveSetting('outputDetail', (e.target as HTMLSelectElement).value);
});

settingsInputs.theme?.addEventListener('change', async (e) => {
  await saveSetting('theme', (e.target as HTMLSelectElement).value);
});

settingsInputs.clearAfterCopy?.addEventListener('change', async (e) => {
  await saveSetting('clearAfterCopy', (e.target as HTMLInputElement).checked);
});

settingsInputs.blockInteractions?.addEventListener('change', async (e) => {
  await saveSetting('blockInteractions', (e.target as HTMLInputElement).checked);
});

function stopRecordingHotkey() {
  isRecordingHotkey = false;
  hotkeyBtn?.classList.remove('recording');
  if (hotkeyBtn) hotkeyBtn.textContent = savedHotkey;
}

hotkeyBtn?.addEventListener('click', () => {
  if (isRecordingHotkey) return;

  isRecordingHotkey = true;
  hotkeyBtn.classList.add('recording');
  hotkeyBtn.textContent = 'Press a key combo...';
});

hotkeyBtn?.addEventListener('keydown', async (e) => {
  if (!isRecordingHotkey) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    stopRecordingHotkey();
    return;
  }

  const combo = formatHotkeyFromEvent(e);
  if (!combo) return;

  const hasModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
  if (!hasModifier && e.key.length === 1) {
    hotkeyBtn.textContent = 'Must include a modifier key';
    return;
  }

  savedHotkey = combo;
  await saveSetting('toggleHotkey', combo);
  stopRecordingHotkey();
});

hotkeyBtn?.addEventListener('blur', stopRecordingHotkey);

init();
