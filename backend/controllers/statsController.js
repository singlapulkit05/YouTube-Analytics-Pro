const DailyStat = require('../models/DailyStat');
const ChannelStat = require('../models/ChannelStat');

const getDashboardStats = async (req, res) => {
  const userId = req.user._id;

  try {
    // 1. Get Daily Stats for the Bar Chart (Last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const dailyStats = await DailyStat.find({
      userId,
      dateString: { $gte: sevenDaysAgo.toISOString().split('T')[0] }
    }).sort({ dateString: 1 });

    // 2. Get Top 10 Channels for Donut Chart & Table
    const topChannels = await ChannelStat.find({ userId })
      .sort({ totalWatchTime: -1 })
      .limit(10);

    // 3. Get Summary Table Data
    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    const allTimeStats = await DailyStat.aggregate([
      { $match: { userId } },
      { $group: { _id: null, totalTime: { $sum: '$totalWatchTime' }, totalVideos: { $sum: '$videosWatched' } } }
    ]);

    const todayStat = await DailyStat.findOne({ userId, dateString: today });
    const yesterdayStat = await DailyStat.findOne({ userId, dateString: yesterday });

    // Week stats
    const weekStats = await DailyStat.aggregate([
      { $match: { userId, dateString: { $gte: sevenDaysAgo.toISOString().split('T')[0] } } },
      { $group: { _id: null, totalTime: { $sum: '$totalWatchTime' }, totalVideos: { $sum: '$videosWatched' } } }
    ]);

    // Month stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthStats = await DailyStat.aggregate([
      { $match: { userId, dateString: { $gte: thirtyDaysAgo.toISOString().split('T')[0] } } },
      { $group: { _id: null, totalTime: { $sum: '$totalWatchTime' }, totalVideos: { $sum: '$videosWatched' } } }
    ]);

    res.json({
      dailyStats,
      topChannels,
      summary: {
        today: {
          watchTime: todayStat?.totalWatchTime || 0,
          videosWatched: todayStat?.videosWatched || 0
        },
        yesterday: {
          watchTime: yesterdayStat?.totalWatchTime || 0,
          videosWatched: yesterdayStat?.videosWatched || 0
        },
        thisWeek: {
          watchTime: weekStats[0]?.totalTime || 0,
          videosWatched: weekStats[0]?.totalVideos || 0
        },
        thisMonth: {
          watchTime: monthStats[0]?.totalTime || 0,
          videosWatched: monthStats[0]?.totalVideos || 0
        },
        total: {
          watchTime: allTimeStats[0]?.totalTime || 0,
          videosWatched: allTimeStats[0]?.totalVideos || 0
        }
      }
    });

  } catch (error) {
    console.error('Stats Error:', error);
    res.status(500).json({ message: 'Server error fetching stats' });
  }
};

module.exports = { getDashboardStats };
