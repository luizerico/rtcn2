const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const User = require('./models/User');
const Group = require('./models/Group');
// Import newly created routes
const authRoutes = require('./routes/authRoutes');

dotenv.config(); 

// Connect to Database
connectDB();

const app = express();
app.use(express.json());

// --- Routes Setup ---
// Authentication Routes (Register, Login, Reset)
app.use('/api/auth', authRoutes);


// Middleware for token verification (Placeholder - To be completed in the next step)
const protect = require('./middleware/authMiddleware'); 

// Example protected route test
app.get('/api/objects/protected-test', protect, async (req, res) => {
    res.json({ message: `Welcome ${req.user.username}! You accessed a protected resource.` });
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`));