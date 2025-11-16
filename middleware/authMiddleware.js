// JWT authentication has been removed - Clerk handles all authentication
// This file now only contains utility middleware functions

// Note: Authentication is now handled by Clerk middleware in middleware/clerkAuth.js
// This file is kept for backward compatibility with asyncHandler and rateLimit utilities

// Rate limiting middleware (simple implementation)
const rateLimitMap = new Map();

export const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    for (const [ip, data] of rateLimitMap.entries()) {
      if (data.windowStart < windowStart) {
        rateLimitMap.delete(ip);
      }
    }

    const userData = rateLimitMap.get(key) || { count: 0, windowStart: now };
    
    if (userData.windowStart < windowStart) {
      userData.count = 1;
      userData.windowStart = now;
    } else {
      userData.count++;
    }

    rateLimitMap.set(key, userData);

    if (userData.count > maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil((userData.windowStart + windowMs - now) / 1000)
      });
    }

    next();
  };
};

// Validate request data middleware
export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

// Error handling wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
