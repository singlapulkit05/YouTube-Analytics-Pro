const DailyStat = require('../models/DailyStat');
const ChannelStat = require('../models/ChannelStat');

// Helper to merge overlapping intervals
const mergeSegments = (segments) => {
  if (segments.length === 0) return [];
  
  // Sort segments by start time
  segments.sort((a, b) => a.start - b.start);

  const merged = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const current = segments[i];
    const lastMerged = merged[merged.length - 1];

    if (current.start <= lastMerged.end) {
      lastMerged.end = Math.max(lastMerged.end, current.end);
    } else {
      merged.push(current);
    }
  }
  return merged;
};

// Compute total time from merged segments
const calculateTotalTime = (segments) => {
  return segments.reduce((total, seg) => total + (seg.end - seg.start), 0);
};

const processWatchSessions = async (userId, sessions) => {
  for (const session of sessions) {
    const { watchSegments, date, channel } = session;
    
    // We assume watchSegments in a single session are already non-overlapping mostly,
    // but we merge them just in case. Multi-tab deduplication is complex to do instantly 
    // across different sessions, but for a simplified approach, we just process each session's segments.
    // A true multi-tab global merge would require fetching all segments for the day.
    
    const mergedSegments = mergeSegments(watchSegments.map(seg => ({...seg})));
    const totalWatchTimeSeconds = calculateTotalTime(mergedSegments);

    if (totalWatchTimeSeconds <= 0) continue;

    const dateString = new Date(date).toISOString().split('T')[0];

    // Update DailyStat
    await DailyStat.findOneAndUpdate(
      { userId, dateString },
      { 
        $inc: { totalWatchTime: totalWatchTimeSeconds, videosWatched: 1 },
        $set: { lastUpdated: new Date() }
      },
      { upsert: true, new: true }
    );

    // Update ChannelStat
    if (channel) {
      await ChannelStat.findOneAndUpdate(
        { userId, channel },
        { 
          $inc: { totalWatchTime: totalWatchTimeSeconds },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true, new: true }
      );
    }
  }
};

module.exports = { processWatchSessions, mergeSegments };
