const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const goalRoutes = require('./routes/goalRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const splitRoutes = require('./routes/splitRoutes');
const recurringRoutes = require('./routes/recurringRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const friendRoutes = require('./routes/friendRoutes');
const { authMiddleware } = require('./middleware/authMiddleware');

const helmet = require('helmet');
const { requestLoggingMiddleware, logger } = require('./utils/logger');

// Fail fast on missing JWT_SECRET
if (!process.env.JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET environment variable is missing.');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

const isProd = process.env.NODE_ENV === 'production';

// Production configuration audit & warnings
if (isProd) {
  const missingProdVars = [];
  if (!process.env.MONGO_URI) missingProdVars.push('MONGO_URI');
  if (!process.env.CLIENT_URL) missingProdVars.push('CLIENT_URL');
  if (!process.env.AWS_RECEIPTS_BUCKET) missingProdVars.push('AWS_RECEIPTS_BUCKET');
  if (!process.env.AWS_REGION) missingProdVars.push('AWS_REGION');
  if (!process.env.AWS_SES_FROM_EMAIL) missingProdVars.push('AWS_SES_FROM_EMAIL');
  if (!process.env.REMINDER_SECRET_KEY) missingProdVars.push('REMINDER_SECRET_KEY');

  if (missingProdVars.length > 0) {
    logger.warn({ missingProdVars }, `[Config Warning] Missing recommended production environment variables: ${missingProdVars.join(', ')}`);
  }
}

const app = express();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || (isProd ? null : 'mongodb://localhost:27017/finsight');
if (isProd && !MONGO_URI) {
  logger.error('FATAL: MONGO_URI must be provided in production.');
  process.exit(1);
}

// Security Headers via Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: isProd ? undefined : false,
  })
);

const allowedOrigins = new Set(
  [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://finsight.anushree-tiwari2024.workers.dev',
    'https://fin-sight-indol-ten.vercel.app',
    process.env.CLIENT_URL,
  ].filter(Boolean)
);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  if (isProd) {
    // In production, match configured client URL, CloudFront, Vercel, or Cloudflare domains
    if (process.env.CLIENT_URL && origin === process.env.CLIENT_URL) return true;
    if (/^https:\/\/[a-z0-9-]+\.cloudfront\.net$/i.test(origin)) return true;
    if (/^https:\/\/[a-z0-9-]+\.workers\.dev$/i.test(origin)) return true;
    if (/^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(origin)) return true;
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
    return false;
  }

  // Development origins
  if (/^http:\/\/localhost(:\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
  return false;
};

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);

// Request body size limits to prevent Denial of Service
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestLoggingMiddleware);

const { rateLimit } = require('express-rate-limit');

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many requests, please slow down.',
  },
});

app.use('/api', apiLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, data: 'FinSight API is running' });
});

// Public auth routes with rate limiting
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/transactions', authMiddleware, transactionRoutes);
app.use('/api/budgets', authMiddleware, budgetRoutes);
app.use('/api/goals', authMiddleware, goalRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/splits', authMiddleware, splitRoutes);
app.use('/api/recurring', authMiddleware, recurringRoutes);
app.use('/api/receipts', authMiddleware, receiptRoutes);
app.use('/api/friends', authMiddleware, friendRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });

