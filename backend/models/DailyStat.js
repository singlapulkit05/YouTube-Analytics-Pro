const mongoose = require('mongoose');

const dailyStatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dateString: { type: String, required: true }, // YYYY-MM-DD
  totalWatchTime: { type: Number, default: 0 }, // In seconds
  videosWatched: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

dailyStatSchema.index({ userId: 1, dateString: 1 }, { unique: true });

module.exports = mongoose.model('DailyStat', dailyStatSchema);
