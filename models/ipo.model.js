import mongoose from 'mongoose';

const ipoSchema = new mongoose.Schema({
  ipoId: { type: Number, unique: true, required: true, index: true },
  slug: { type: String, unique: true, required: true, index: true },
  companyName: { type: String, required: true, index: true },
  companyLogo: { type: String },
  type: { type: String, enum: ['MAINBOARD', 'SME'] },
  exchanged: { type: String, enum: ['BOTH', 'NSE', 'BSE'] },
  issueType: { type: String, enum: ['IPO', 'FPO'] },
  startDate: { type: String },
  endDate: { type: String },
  allotmentDate: { type: String },
  listingDate: { type: String },
  lotSize: { type: Number },
  minimumPrice: { type: Number },
  maximumPrice: { type: Number },
  totalIssuePrice: { type: String },
  symbol: { type: String }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
ipoSchema.virtual('dates').get(function () {
  return {
    open: this.startDate,
    close: this.endDate,
    allotment: this.allotmentDate,
    listing: this.listingDate
  };
});

const Ipo = mongoose.models.Ipo || mongoose.model('Ipo', ipoSchema);

export default Ipo;
