import { Overlay } from './overlay/Overlay';
import { FeedbackManager } from './feedback/FeedbackManager';
import { getSettings, getFeedback } from '../shared/storage';
import { sendMessage } from '../shared/messaging';
import type { OverlayMode } from '../shared/types';

interface RestoredState {
  isActive: boolean;
  isPaused: boolean;
  markersVisible: boolean;
  mode: OverlayMode;
}

let overlay: Overlay | null = null;
let feedbackManager: FeedbackManager | null = null;
let currentUrl: string = window.location.href;

async function initializeOverlay(restore?: Partial<RestoredState>) {
  if (overlay) return;

  const settings = await getSettings();
  const feedback = await getFeedback(window.location.href);

  currentUrl = window.location.href;
  feedbackManager = new FeedbackManager(currentUrl, feedback);
  overlay = new Overlay(settings, feedbackManager);
  overlay.activate();

  // Restore the view state the tab had before the reload.
  if (restore) {
    if (restore.mode) overlay.setMode(restore.mode);
    if (restore.markersVisible === false) overlay.toggleMarkers();
    if (restore.isPaused) overlay.togglePause();
  }

  // Frameworks often paint after document_idle, so saved copy changes are
  // re-applied a few times before giving up on elements that never appear.
  scheduleTextEditReapply();
}

/**
 * Re-apply saved text edits on a short backoff. Each pass is a no-op for
 * elements already carrying the edited copy, so repeats are harmless.
 */
function scheduleTextEditReapply() {
  const delays = [0, 100, 300, 800, 1500];
  for (const delay of delays) {
    setTimeout(() => {
      if (!overlay?.isActive) return;
      overlay.applySavedTextEdits();
      overlay.refreshMarkerPositions();
    }, delay);
  }
}

/**
 * On load, ask the background whether the overlay was active in this tab and
 * bring it back if so, together with its markers and applied copy changes.
 */
async function restoreIfActive() {
  try {
    const state = await sendMessage<RestoredState>({ type: 'GET_STATE' });
    if (state?.isActive) {
      await initializeOverlay(state);
    }
  } catch (error) {
    // Background not reachable (e.g. extension reloading); nothing to restore.
    console.debug('AgentEcho: could not restore overlay state', error);
  }
}

function deactivateOverlay() {
  if (overlay) {
    try {
      overlay.deactivate();
    } catch (e) {
      console.error('Error deactivating overlay:', e);
    }
    overlay = null;
  }
  feedbackManager = null;
}

async function handleUrlChange() {
  // Wait for the URL to actually update
  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));

  const newUrl = window.location.href;

  // Only reload if URL actually changed and overlay exists
  if (newUrl !== currentUrl && overlay) {
    currentUrl = newUrl;

    // Clear old markers and feedback
    overlay.clearAllMarkers();

    // Load feedback for new URL
    const feedback = await getFeedback(newUrl);
    feedbackManager = new FeedbackManager(newUrl, feedback);

    // Update overlay with new feedback manager
    overlay.updateFeedbackManager(feedbackManager);

    // Re-apply saved copy changes, then load markers for the new URL
    overlay.applySavedTextEdits();
    overlay.loadExistingMarkers();
    scheduleTextEditReapply();
  }
}

function setupUrlMonitoring() {
  let lastCheckedUrl = window.location.href;

  // Use requestAnimationFrame for efficient URL checking
  function checkUrl() {
    const currentUrl = window.location.href;

    if (currentUrl !== lastCheckedUrl && overlay) {
      lastCheckedUrl = currentUrl;
      handleUrlChange();
    }

    // Continue checking
    requestAnimationFrame(checkUrl);
  }

  // Start the rAF loop
  requestAnimationFrame(checkUrl);

  // Also listen to standard events as backup
  window.addEventListener('popstate', () => {
    lastCheckedUrl = window.location.href;
    handleUrlChange();
  });

  window.addEventListener('hashchange', () => {
    lastCheckedUrl = window.location.href;
    handleUrlChange();
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'ACTIVATE_OVERLAY':
      initializeOverlay();
      break;
    case 'DEACTIVATE_OVERLAY':
      deactivateOverlay();
      break;
    case 'TOGGLE_MARKERS':
      overlay?.toggleMarkers();
      break;
    case 'TOGGLE_PAUSE':
      overlay?.togglePause();
      break;
    case 'SET_MODE':
      overlay?.setMode(message.mode);
      sendResponse({ success: true });
      break;
    case 'CLEAR_FEEDBACK':
      feedbackManager?.clearAll();
      overlay?.clearAllMarkers();
      sendResponse({ success: true });
      break;
    case 'DOWNLOAD_FEEDBACK':
      sendResponse({ success: overlay?.downloadFeedback() ?? false });
      break;
    case 'COPY_FEEDBACK':
      const markdown = feedbackManager?.toMarkdown();
      if (markdown) {
        navigator.clipboard.writeText(markdown);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
      return true;
    case 'ADD_FEEDBACK':
      feedbackManager?.add(message.item);
      overlay?.loadExistingMarkers();
      sendResponse({ success: true });
      break;
    case 'REMOVE_FEEDBACK':
      feedbackManager?.remove(message.id);
      overlay?.removeMarker(message.id);
      sendResponse({ success: true });
      break;
    case 'UPDATE_FEEDBACK':
      feedbackManager?.update(message.id, message.updates);
      overlay?.refreshMarkers();
      sendResponse({ success: true });
      break;
  }
  return false;
});

function isTypingContext(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  );
}

document.addEventListener('keydown', (e) => {
  if (!overlay?.isActive) return;

  // While the user is typing - including an inline text edit - single-key
  // shortcuts would otherwise clear feedback or copy mid-word.
  const typing = isTypingContext() || overlay.isEditingText;

  if (e.key === 'Escape' && !typing) {
    deactivateOverlay();
  }

  if (e.ctrlKey || e.metaKey) {
    if (e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      deactivateOverlay();
    }
  }

  if (typing) return;

  if (e.key.toLowerCase() === 't') {
    e.preventDefault();
    overlay?.toggleMode();
  }

  if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const markdown = feedbackManager?.toMarkdown();
    if (markdown) {
      navigator.clipboard.writeText(markdown);
      alert('Feedback copied to clipboard!');
    }
  }

  if (e.key.toLowerCase() === 'd') {
    e.preventDefault();
    overlay?.downloadFeedback();
  }

  if (e.key.toLowerCase() === 'h') {
    e.preventDefault();
    overlay?.toggleMarkers();
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    overlay?.clearAll();
  }
});

// Setup URL monitoring for SPA navigation detection
setupUrlMonitoring();

// Bring the overlay back if this tab had it active before the reload.
restoreIfActive();
