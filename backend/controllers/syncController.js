const WatchSession = require('../models/WatchSession');
const { processWatchSessions } = require('../services/aggregation');

const syncData = async (req, res) => {
  const { sessions } = req.body;
  const userId = req.user._id;

  if (!sessions || !Array.isArray(sessions)) {
    return res.status(400).json({ message: 'Invalid sessions data' });
  }

  try {
    const newSessions = [];

    for (const session of sessions) {
      const { videoId, title, channel, source, tabId, eventId, watchSegments } = session;

      // Check if session with eventId already exists (deduplication)
      const existingSession = await WatchSession.findOne({ eventId, userId });
      if (!existingSession) {
        const newSession = await WatchSession.create({
          userId,
          videoId,
          title,
          channel,
          source,
          tabId,
          eventId,
          watchSegments
        });
        newSessions.push(newSession);
      }
    }

    // Trigger asynchronous aggregation if we inserted new sessions
    if (newSessions.length > 0) {
      // Run process asynchronously without blocking the sync response
      processWatchSessions(userId, newSessions).catch(err => {
        console.error('Aggregation error:', err);
      });
    }

    res.status(200).json({ message: 'Sync successful', syncedCount: newSessions.length });
  } catch (error) {
    console.error('Sync Error:', error);
    res.status(500).json({ message: 'Server error during sync' });
  }
};

module.exports = { syncData };
