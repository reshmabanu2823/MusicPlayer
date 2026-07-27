const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/musicDB";

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000  // fail fast if MongoDB is not reachable
})
.then(() => console.log("✅ MongoDB connected →", MONGO_URI))
.catch(err => {
  console.error("❌ MongoDB connection failed:", err.message);
  console.error("   Make sure MongoDB is running: mongod");
  // Don't crash the server — auth routes will fail gracefully per request
});