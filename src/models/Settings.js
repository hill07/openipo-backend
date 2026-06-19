import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    showIpoGuru: { type: Boolean, default: false },
    gmpSource: { type: String, default: '' },
    gmpSourceLink: { type: String, default: '' }
}, {
    timestamps: true
});

export default mongoose.model("Settings", settingsSchema);
