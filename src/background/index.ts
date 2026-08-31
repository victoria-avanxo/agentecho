import { getSettings, saveSettings, getFeedback, saveFeedback } from '../shared/storage';
import type { OverlayMode } from '../shared/types';

interface TabState {
  isActive: boolean;
  isPaused: boolean;
  markersVisible: boolean;
  mode: OverlayMode;
}

const SESSION_KEY = 'agentecho_tab_states';

const DEFAULT_TAB_STATE: TabState = {
  isActive: false,
  isPaused: false,
  markersVisible: true,
  mode: 'comment',
};

const tabStates = new Map<number, TabState>();

/**
 * The service worker is terminated freely under MV3, which would drop the
 * in-memory map and make an active overlay look inactive after a page reload.
 * chrome.storage.session survives worker restarts and is cleared when the
 * browser closes - exactly the lifetime "is the overlay on in this tab" needs.
 */
const restored = chrome.storage.session
  .get(SESSION_KEY)
  .then((result) => {
    const stored = result[SESSION_KEY] as Record<string, TabState> | undefined;
    if (!stored) return;
    for (const [id, state] of Object.entries(stored)) {
      tabStates.set(Number(id), { ...DEFAULT_TAB_STATE, ...state });
    }
  })
  .catch((error) => console.error('Failed to restore tab states:', error));

function persistTabStates(): void {
  const plain: Record<string, TabState> = {};
  tabStates.forEach((state, id) => {
    plain[String(id)] = state;
  });
  chrome.storage.session.set({ [SESSION_KEY]: plain }).catch((error) => {
    console.error('Failed to persist tab states:', error);
  });
}

function getTabState(tabId: number): TabState {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, { ...DEFAULT_TAB_STATE });
  }
  return tabStates.get(tabId)!;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Use tabId from message payload (for popup) or from sender.tab (for content scripts)
  const tabId = message.tabId ?? sender.tab?.id;

  switch (message.type) {
    case 'TOGGLE_EXTENSION': {
      if (tabId === undefined) {
        sendResponse({ error: 'No tabId provided', isActive: false });
        break;
      }
      // Wait for the restore so a toggle can't race the worker waking up.
      restored.then(() => {
        const state = getTabState(tabId);
        state.isActive = !state.isActive;
        if (!state.isActive) {
          // Leaving the overlay resets transient view state.
          state.isPaused = false;
          state.mode = 'comment';
        }
        persistTabStates();
        sendResponse({ isActive: state.isActive });
      });
      return true;
    }

    case 'GET_STATE': {
      if (tabId === undefined) {
        sendResponse({ error: 'No tabId provided', ...DEFAULT_TAB_STATE });
        break;
      }
      restored.then(() => sendResponse(getTabState(tabId)));
      return true;
    }

    case 'SET_STATE': {
      if (tabId === undefined) {
        sendResponse({ error: 'No tabId provided' });
        break;
      }
      restored.then(() => {
        const currentState = getTabState(tabId);
        Object.assign(currentState, message.state);
        persistTabStates();
        sendResponse(getTabState(tabId));
      });
      return true;
    }

    case 'GET_SETTINGS':
      getSettings().then(sendResponse);
      return true;

    case 'SAVE_SETTINGS':
      saveSettings(message.settings).then(() => sendResponse({ success: true }));
      return true;

    case 'GET_FEEDBACK':
      getFeedback(message.url).then(sendResponse);
      return true;

    case 'SAVE_FEEDBACK':
      saveFeedback(message.url, message.feedback).then(() => sendResponse({ success: true }));
      return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  persistTabStates();
});
