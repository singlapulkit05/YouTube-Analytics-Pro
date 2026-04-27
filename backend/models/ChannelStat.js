const mongoose = require('mongoose');

const channelStatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  channel: { type: String, required: true },
  totalWatchTime: { type: Number, default: 0 }, // In seconds
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

channelStatSchema.index({ userId: 1, channel: 1 }, { unique: true });

module.exports = mongoose.model('ChannelStat', channelStatSchema);
