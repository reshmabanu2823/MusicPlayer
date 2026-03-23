const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");

const SECRET_KEY = process.env.JWT_SECRET || "secretkey";

const transporter = require("../config/email");   

const authenticateToken = require("../middleware/auth");

// Email validation regex
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/* =========================
   GET CURRENT USER PROFILE
   GET /auth/profile
========================= */

router.get("/profile", authenticateToken, async (req, res) => {

  try {

    const user = await User.findById(req.user.id).select("-password");

    res.json(user);

  } catch (error) {

    res.status(500).json({ error: error.message });

  }

});

/* =========================
   REGISTER USER
   POST /auth/register
========================= */

router.post("/register", async (req, res) => {
  try {

    const { name, email, password } = req.body;

    // Validate email format
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      name,
      email,
      password: hashedPassword
    });

    await user.save();

    res.json({ message: "User registered successfully" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/* =========================
   LOGIN USER
   POST /auth/login
========================= */

router.post("/login", async (req, res) => {
  try {

    const { email, password } = req.body;

    // Validate email format
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: user._id },
      SECRET_KEY,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/* =========================
   FORGOT PASSWORD
   POST /auth/forgot-password
========================= */

router.post("/forgot-password", async (req, res) => {

  try {

    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP in database
    user.otp = otp;
    user.otpExpires = Date.now() + 300000; // 5 minutes

    await user.save();

    // Send OTP to email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP for password reset is: ${otp}`
    });

    res.json({
      message: "OTP sent to email"
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});

router.post("/verify-otp", async (req, res) => {

  try {

    const { email, otp } = req.body;

    const user = await User.findOne({
      email,
      otp,
      otpExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired OTP"
      });
    }

    res.json({
      message: "OTP verified"
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});


/* =========================
   RESET PASSWORD
   POST /auth/reset-password
========================= */

router.post("/reset-password", async (req, res) => {

  try {

    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;

    // Clear OTP
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();

    res.json({
      message: "Password reset successful"
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});


module.exports = router;