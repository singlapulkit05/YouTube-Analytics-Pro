const mongoose = require('mongoose');

const segmentSchema = new mongoose.Schema({
  start: { type: Number, required: true },
  end: { type: Number, required: true }
}, { _id: false });

const watchSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  videoId: { type: String, required: true },
  title: { type: String },
  channel: { type: String },
  source: { type: String, enum: ['youtube', 'music.youtube'], required: true },
  tabId: { type: Number, required: true },
  eventId: { type: String, required: true, unique: true }, // For deduplication
  watchSegments: [segmentSchema],
  date: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

module.exports = mongoose.model('WatchSession', watchSessionSchema);
