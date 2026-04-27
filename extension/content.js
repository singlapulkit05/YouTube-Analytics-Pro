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
  
  if (!videoId) return null;

  let title = '';
  let channel = '';

  if (currentSource === 'youtube') {
    title = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata')?.innerText || '';
    channel = document.querySelector('ytd-channel-name .yt-formatted-string')?.innerText || '';
  } else {
    title = document.querySelector('yt-formatted-string.title')?.innerText || '';
    channel = document.querySelector('yt-formatted-string.byline')?.innerText || '';
  }

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

  try {
    chrome.runtime.sendMessage(payload);
  } catch (e) {
    console.warn("Could not send message to background script:", e);
  }
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(() => {
    if (!videoElement) return;

    const isPlaying = !videoElement.paused && !videoElement.ended && videoElement.readyState > 2;
    if (!isPlaying) return;

    const currentTime = videoElement.currentTime;
    const delta = currentTime - lastTimestamp;

    // Normal playback
    if (delta > 0 && delta < 2.5) {
      if (!currentSegment) {
        currentSegment = { start: lastTimestamp, end: currentTime };
        watchSegments.push(currentSegment);
      } else {
        // Extend current segment
        currentSegment.end = currentTime;
      }
    } else {
      // Seek occurred or video stalled, end current segment and start a new one next tick
      currentSegment = null;
    }

    lastTimestamp = currentTime;

  }, 1000);
}

function initVideoTracking() {
  videoElement = document.querySelector('video');
  if (!videoElement) {
    setTimeout(initVideoTracking, 1000);
    return;
  }

  const meta = extractVideoMeta();
  if (!meta || !meta.videoId) return;

  if (meta.videoId !== currentVideoId) {
    // We switched videos
    if (currentVideoId) {
      sendSessionUpdate(true); // Sync previous video
    }
    
    currentVideoId = meta.videoId;
    currentTitle = meta.title;
    currentChannel = meta.channel;
    watchSegments = [];
    currentSegment = null;
    eventIdBase = Date.now().toString(); // unique for this session
  }

  lastTimestamp = videoElement.currentTime;
  startHeartbeat();

  videoElement.addEventListener('pause', () => {
    currentSegment = null; // Break segment on pause
  });

  videoElement.addEventListener('seeked', () => {
    currentSegment = null; // Break segment on seek
    lastTimestamp = videoElement.currentTime;
  });

  videoElement.addEventListener('ended', () => {
    currentSegment = null;
    sendSessionUpdate(true);
  });
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

// Initial load
setTimeout(initVideoTracking, 2000);
