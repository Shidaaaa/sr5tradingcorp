const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { sendVerificationCodeEmail } = require('../utils/email');
require('dotenv').config();

const router = express.Router();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashVerificationCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildAuthResponse(user) {
  const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const userData = user.toObject ? user.toObject() : user;
  delete userData.password;
  delete userData.verification_code_hash;
  return { token, user: userData };
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, address, city } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'Email, password, first name, and last name are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      if (existing.email_verified) {
        return res.status(400).json({ error: 'Email already registered.' });
      }
      return res.status(409).json({
        error: 'This email is already registered but not yet verified. Please verify your email.',
        needs_verification: true,
        email: existing.email,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const user = await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      first_name,
      last_name,
      phone: phone || null,
      address: address || null,
      city: city || null,
      email_verified: false,
      verification_code_hash: hashVerificationCode(verificationCode),
      verification_code_expires_at: new Date(Date.now() + 10 * 60 * 1000),
      verification_code_sent_at: new Date(),
    });

    try {
      await sendVerificationCodeEmail({ toEmail: user.email, firstName: user.first_name, code: verificationCode });
    } catch (mailErr) {
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ error: mailErr.message || 'Failed to send verification email.' });
    }

    res.status(201).json({
      message: 'Registration successful. Verification code has been sent to your email.',
      needs_verification: true,
      email: user.email,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// Verify email with one-time code
router.post('/verify-email', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (user.email_verified) {
      const auth = buildAuthResponse(user);
      return res.json({ message: 'Email already verified.', ...auth });
    }

    if (!user.verification_code_hash || !user.verification_code_expires_at) {
      return res.status(400).json({ error: 'No active verification code. Please request a new one.' });
    }

    if (new Date(user.verification_code_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
    }

    const incomingHash = hashVerificationCode(code);
    if (incomingHash !== user.verification_code_hash) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    user.email_verified = true;
    user.verification_code_hash = null;
    user.verification_code_expires_at = null;
    user.verification_code_sent_at = null;
    await user.save();

    const auth = buildAuthResponse(user);
    res.json({ message: 'Email verified successfully.', ...auth });
  } catch (err) {
    res.status(500).json({ error: 'Server error verifying email.' });
  }
});

// Resend verification code
router.post('/resend-verification', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.email_verified) return res.status(400).json({ error: 'Email is already verified.' });

    const lastSentAt = user.verification_code_sent_at ? new Date(user.verification_code_sent_at).getTime() : 0;
    if (Date.now() - lastSentAt < 60 * 1000) {
      return res.status(429).json({ error: 'Please wait at least 60 seconds before requesting a new code.' });
    }

    const verificationCode = generateVerificationCode();
    user.verification_code_hash = hashVerificationCode(verificationCode);
    user.verification_code_expires_at = new Date(Date.now() + 10 * 60 * 1000);
    user.verification_code_sent_at = new Date();
    await user.save();

    await sendVerificationCodeEmail({ toEmail: user.email, firstName: user.first_name, code: verificationCode });
    res.json({ message: 'Verification code sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error sending verification code.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password.' });

    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Email is not verified. Please verify your account first.',
        needs_verification: true,
        email: user.email,
      });
    }

    const auth = buildAuthResponse(user);
    res.json({ message: 'Login successful', ...auth });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, phone, address, city } = req.body;
    const updates = {};
    if (first_name) updates.first_name = first_name;
    if (last_name) updates.last_name = last_name;
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    res.json({ message: 'Profile updated.', user });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(current_password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect.' });

    user.password = await bcrypt.hash(new_password, 10);
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
