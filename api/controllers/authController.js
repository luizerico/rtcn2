const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid'); // Need to install uuid and handle import

// --- Utility Function (Mock Email Sender) ---
// In a real app, this would send an email via SendGrid/AWS SES
const mockSendEmail = async (email, subject, message) => {
    console.log(`[MOCK EMAIL SENT] To: ${email} | Subject: ${subject}`);
    // Simulate successful sending delay
    return true;
};

/**
 * @desc    Registers a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.registerUser = async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Please include all fields.' });
    }

    try {
        // Check if user already exists
        let existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ message: 'User or Email already registered.' });
        }

        // Hash password
        const salt = await bcrypt.gensalt();
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user (Note: We need to ensure uuid is available for token generation later)
        const newUser = await User.create({
            username,
            email,
            password: hashedPassword,
            // roleId and other fields handled on initial group assignment/onboarding
        });

        res.status(201).json({ 
            message: 'User registered successfully.', 
            user: { id: newUser._id, username: newUser.username, email: newUser.email } 
        });

    } catch (err) {
        console.error("Registration Error:", err);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

/**
 * @desc    Authenticates user and sets up JWT
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.loginUser = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Please provide username and password.' });
    }

    try {
        // Find user by username or email (assuming we enforce one primary lookup field for login)
        const user = await User.findOne({ $or: [{ username }, { email }] });

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Success! Generate JWT token
        const token = jwt.sign(
            { id: user._id, username: user.username }, 
            process.env.JWT_SECRET || 'default-secret', // Should be loaded from .env
            { expiresIn: '1h' }
        );

        res.status(200).json({ 
            message: 'Login successful.', 
            token, 
            user: { id: user._id, username: user.username, email: user.email }
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

/**
 * @desc    Request password reset link/code
 * @route   GET /api/auth/forgot-password
 * @access  Public
 */
exports.requestPasswordReset = async (req, res) => {
    const { email } = req.query; // Assuming email is passed via query for simplicity in this route setup

    if (!email) {
        return res.status(400).json({ message: 'Email is required.' });
    }

    try {
        // 1. Find user by email and generate token if not present/expired
        let user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // 2. Generate secure, time-limited token (Using uuidv4 for simplicity here)
        const resetToken = uuidv4(); 
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 3); // Token valid for 3 days

        // 3. Update user record with token and expiry
        user.resetToken = resetToken;
        user.tokenExpiry = expirationDate;
        await user.save();

        // 4. Send the mock email (The actual link must contain /reset-password/TOKEN)
        const message = `Use this secure link to reset your password: ${process.env.CLIENT_URL || 'http://localhost:3000'}/reset/${resetToken}`;
        await mockSendEmail(user.email, "Password Reset Request", message);

        res.status(200).json({ 
            message: 'Password reset link sent successfully to your email.',
            // NOTE: NEVER send the token in production response!
        });
    } catch (err) {
        console.error("Password Reset Error:", err);
        res.status(500).json({ message: 'Error requesting password reset.' });
    }
};

/**
 * @desc    Resets user's password using a token
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
exports.resetPassword = async (req, res) => {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
        return res.status(400).json({ message: 'New password is required.' });
    }

    try {
        // 1. Validate token and expiry
        const user = await User.findOne({ resetToken: token }).select('password, email, resetToken, tokenExpiry');
        
        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired password reset token.' });
        }

        if (user.tokenExpiry < new Date()) {
             // Clean up the expired token to prevent brute-force attempts
            await User.findByIdAndUpdate(user._id, { $set: { resetToken: null, tokenExpiry: null } });
            return res.status(400).json({ message: 'Password reset link has expired.' });
        }

        // 2. Hash and update password
        const salt = await bcrypt.gensalt();
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedPassword;
        user.resetToken = null; // Invalidate the token immediately after use
        user.tokenExpiry = null;
        await user.save();

        res.status(200).json({ message: 'Password reset successful.' });

    } catch (err) {
        console.error("Password Reset Error:", err);
        res.status(500).json({ message: 'Server error during password reset.' });
    }
};