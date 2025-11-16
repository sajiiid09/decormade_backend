import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { serve } from 'inngest/express';

// Import Clerk middleware
import { clerkMiddleware, attachClerkUser } from './middleware/clerkAuth.js';

// Import Inngest setup
import { inngest } from './inngest/client.js';
import { inngestFunctions } from './inngest/functions/syncClerkUser.js';

// Import routes
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import userRoutes from './routes/userRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk authentication middleware (must come before routes)
app.use(clerkMiddleware);
app.use(attachClerkUser);

// Inngest endpoint for worker communication (must come before other routes)
app.use(
  '/api/inngest',
  serve({
    client: inngest,
    functions: inngestFunctions,
  })
);

// Webhook routes (before other routes but after Clerk middleware)
app.use('/api/webhooks', webhookRoutes);

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
});
