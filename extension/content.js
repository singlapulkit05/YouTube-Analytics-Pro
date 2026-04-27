let currentVideoId = null;
let currentTitle = null;
let currentChannel = null;
let currentSource = window.location.hostname.includes('music') ? 'music.youtube' : 'youtube';

let videoElement = null;
let heartbeatInterval = null;

let lastTimestamp = 0;
let currentSegment = null;
let watchSegments = [];
let eventIdBase = '';

// Generate a random string for tab session ID
const tabSessionId = Math.random().toString(36).substring(2, 15);

function extractVideoMeta() {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  
  if (!videoId) {
    console.log('[YT Analytics] No videoId found in URL');
    return null;
  }

  let title = '';
  let channel = '';

  if (currentSource === 'youtube') {
    title = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata')?.innerText || '';
    channel = document.querySelector('ytd-channel-name .yt-formatted-string')?.innerText || '';
  } else {
    title = document.querySelector('yt-formatted-string.title')?.innerText || '';
    channel = document.querySelector('yt-formatted-string.byline')?.innerText || '';
  }

  console.log(`[YT Analytics] Meta Extracted - ID: ${videoId}, Title: ${title}, Channel: ${channel}`);
  return { videoId, title, channel };
}

function sendSessionUpdate(forceSync = false) {
  if (!currentVideoId || watchSegments.length === 0) return;

  const payload = {
    type: 'SYNC_SESSION',
    data: {
      videoId: currentVideoId,
      title: currentTitle,
      channel: currentChannel,
      source: currentSource,
      tabId: tabSessionId,
      eventId: `${currentVideoId}_${eventIdBase}`,
      watchSegments: [...watchSegments]
    },
    forceSync
  };

  console.log('[YT Analytics] Sending Session Update to Background:', payload);

  try {
    chrome.runtime.sendMessage(payload);
    // Clear segments so we don't send duplicates, and start a new batch
    watchSegments = [];
    currentSegment = null;
    eventIdBase = Date.now().toString();
  } catch (e) {
    console.warn("[YT Analytics] Could not send message to background script:", e);
  }
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  console.log('[YT Analytics] Heartbeat Started');
  
  heartbeatInterval = setInterval(() => {
    if (!videoElement) {
      console.log('[YT Analytics] Heartbeat: No video element');
      return;
    }

    const isPlaying = !videoElement.paused && !videoElement.ended;
    if (!isPlaying) {
      currentSegment = null;
      return;
    }

    const currentTime = videoElement.currentTime;
    
    if (!currentSegment) {
      currentSegment = { start: currentTime, end: currentTime };
      watchSegments.push(currentSegment);
    } else {
      const delta = Math.abs(currentTime - lastTimestamp);
      if (delta > 2.5) {
        // A skip occurred
        currentSegment = { start: currentTime, end: currentTime };
        watchSegments.push(currentSegment);
      } else {
        currentSegment.end = currentTime;
      }
    }
    
    lastTimestamp = currentTime;

    // Fire live tick (1 second of real time)
    try {
      chrome.runtime.sendMessage({
        type: 'LIVE_TICK',
        data: { delta: 1, channel: currentChannel }
      });
    } catch (e) { /* ignore */ }

  }, 1000);
}

function initVideoTracking() {
  console.log('[YT Analytics] initVideoTracking called');
  videoElement = document.querySelector('.html5-main-video') || document.querySelector('video');
  
  if (!videoElement) {
    console.log('[YT Analytics] No video element found, retrying...');
    setTimeout(initVideoTracking, 1000);
    return;
  }

  const meta = extractVideoMeta();
  if (!meta || !meta.videoId) return;

  if (meta.videoId !== currentVideoId) {
    console.log('[YT Analytics] Video switched to:', meta.videoId);
    if (currentVideoId) {
      sendSessionUpdate(true);
    }
    
    currentVideoId = meta.videoId;
    currentTitle = meta.title;
    currentChannel = meta.channel;
    watchSegments = [];
    currentSegment = null;
    eventIdBase = Date.now().toString();
  }

  lastTimestamp = videoElement.currentTime;
  startHeartbeat();

  if (!videoElement.hasAttribute('data-yta-tracked')) {
    videoElement.setAttribute('data-yta-tracked', 'true');
    videoElement.addEventListener('ended', () => {
      currentSegment = null;
      sendSessionUpdate(true);
    });
  }
}

// Support for YT SPA navigation
window.addEventListener('yt-navigate-finish', () => {
  setTimeout(initVideoTracking, 1000);
});

// Periodic sync (every 30 seconds from content script side to background)
setInterval(() => {
  sendSessionUpdate(false);
}, 30000);

// Flush on close
window.addEventListener('beforeunload', () => {
  if (currentVideoId) {
    sendSessionUpdate(true);
  }
});

// Reply to popup with unsynced time
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PENDING_STATS') {
    const pendingTime = watchSegments.reduce((acc, seg) => acc + (seg.end - seg.start), 0);
    sendResponse({ pendingTime, channel: currentChannel });
  }
});

// Initial load
setTimeout(initVideoTracking, 2000);
