import mongoose from "mongoose";

const ReservationRowSchema = new mongoose.Schema(
  {
    name: String,
    maximumAllottees: Number,
    sharesOffered: Number,
    percentage: String,
    sharesOfferedMessage: String,
  },
  { _id: false }
);

const IpoReservationSchema = new mongoose.Schema(
  {
    ipoId: { type: Number, required: true, index: true },
    slug: { type: String, required: true, index: true }, // ❌ not unique

    reservations: [ReservationRowSchema],
  },
  { timestamps: true }
);

IpoReservationSchema.index({ ipoId: 1 }, { unique: true });

export default mongoose.model("IpoReservation", IpoReservationSchema);
