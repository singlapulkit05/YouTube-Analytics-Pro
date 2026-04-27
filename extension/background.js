const API_URL = 'http://localhost:5000/api';

let sessionQueue = new Map(); // key: eventId, value: sessionData

// Initialize alarms
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("syncData", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "syncData") {
    syncToBackend();
  }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_SESSION') {
    const data = message.data;
    
    // Add/Update in queue
    sessionQueue.set(data.eventId, data);

    if (message.forceSync) {
      syncToBackend();
    }
  } else if (message.type === 'GET_AUTH_STATE') {
    chrome.storage.local.get(['accessToken', 'username'], (result) => {
      sendResponse(result);
    });
    return true; // async
  } else if (message.type === 'LOGOUT') {
    chrome.storage.local.remove(['accessToken', 'refreshToken', 'username'], () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function getTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['accessToken', 'refreshToken'], resolve);
  });
}

async function setTokens(accessToken, refreshToken) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ accessToken, refreshToken }, resolve);
  });
}

async function syncToBackend() {
  if (sessionQueue.size === 0) return;

  const { accessToken, refreshToken } = await getTokens();
  if (!accessToken) return; // User not logged in

  const sessionsToSync = Array.from(sessionQueue.values());

  try {
    let response = await fetch(`${API_URL}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ sessions: sessionsToSync })
    });

    if (response.status === 401 && refreshToken) {
      // Try refresh token
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (refreshRes.ok) {
        const { accessToken: newAccess, refreshToken: newRefresh } = await refreshRes.json();
        await setTokens(newAccess, newRefresh);
        
        // Retry sync
        response = await fetch(`${API_URL}/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${newAccess}`
          },
          body: JSON.stringify({ sessions: sessionsToSync })
        });
      } else {
        // Refresh failed, logout
        chrome.storage.local.remove(['accessToken', 'refreshToken', 'username']);
        return;
      }
    }

    if (response.ok) {
      // Clear queue on success
      sessionQueue.clear();
    }

  } catch (error) {
    console.error("Sync failed, will retry next alarm:", error);
  }
}
