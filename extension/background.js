const API_URL = 'https://youtube-analytics-pro.onrender.com/api';

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_SESSION') {
    syncToBackend([message.data]);
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

async function syncToBackend(sessionsToSync) {
  if (!sessionsToSync || sessionsToSync.length === 0) return;

  const { accessToken, refreshToken } = await getTokens();
  if (!accessToken) return; // User not logged in

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
        await fetch(`${API_URL}/sync`, {
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
      }
    }
  } catch (error) {
    console.error("Sync failed:", error);
  }
}
