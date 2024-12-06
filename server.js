const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
// Configure CORS with explicit options
app.use(
  cors({
    origin: 'http://localhost:3000', // Allow requests from the frontend
    credentials: true,               // Allow credentials (cookies, etc.)
  })
);

// Parse incoming JSON requests
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/auth', require('./routes/userRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/tables', require('./routes/tableRoute'));

// JWT Authentication Middleware (for example, to protect your routes)
const authMiddleware = require('./middleware/authMiddleware');

// Protected route example
app.use('/api/user', authMiddleware, require('./routes/userProfileRoutes'));  // Ensure the user is authenticated before accessing profile routes

// 404 Error handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({ message: 'Route not found' });
});

// General error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Something went wrong!',
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
