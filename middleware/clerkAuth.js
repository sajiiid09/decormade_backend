import { clerkMiddleware as clerkExpressMiddleware, clerkClient } from '@clerk/express';
import prisma from '../config/db.js';

/**
 * Clerk middleware - verifies Clerk session token using @clerk/express
 * This middleware checks for Authorization header with Bearer token
 * Sets req.auth.userId if authenticated, otherwise req.auth is undefined
 * This middleware is applied globally but doesn't require auth (allows public routes)
 */
export const clerkMiddleware = clerkExpressMiddleware();

/**
 * Attach Clerk user to request and upsert/find Prisma user
 * This middleware should run after clerkMiddleware
 */
export const attachClerkUser = async (req, res, next) => {
  try {
    // If no auth from Clerk, continue without user (for public routes)
    if (!req.auth || !req.auth.userId) {
      req.prismaUser = null;
      return next();
    }

    const clerkUserId = req.auth.userId;

    // Fetch full Clerk user data
    const clerkUser = await clerkClient.users.getUser(clerkUserId);

    if (!clerkUser) {
      return res.status(401).json({
        success: false,
        message: 'User not found in Clerk',
      });
    }

    // Extract user data from Clerk
    const email = clerkUser.emailAddresses?.[0]?.emailAddress || clerkUser.primaryEmailAddressId;
    const firstName = clerkUser.firstName || null;
    const lastName = clerkUser.lastName || null;
    const profilePicture = clerkUser.imageUrl || null;

    // Upsert user in Prisma (create if doesn't exist, update if exists)
    const prismaUser = await prisma.user.upsert({
      where: { id: clerkUserId },
      update: {
        email: email || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        profilePicture: profilePicture || undefined,
        lastLogin: new Date(),
        loginCount: { increment: 1 },
      },
      create: {
        id: clerkUserId, // Use Clerk user ID as primary key
        email: email || '',
        firstName: firstName || null,
        lastName: lastName || null,
        profilePicture: profilePicture || null,
        role: 'CUSTOMER', // Default role
        isActive: true,
        loginCount: 1,
        lastLogin: new Date(),
      },
      include: { addresses: true },
    });

    // Check if user is active
    if (!prismaUser.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated',
      });
    }

    // Attach both Clerk user and Prisma user to request
    req.clerkUser = clerkUser;
    req.prismaUser = prismaUser;
    // For backward compatibility, also set req.user
    req.user = prismaUser;

    next();
  } catch (error) {
    console.error('Attach Clerk user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Require admin role - must run after attachClerkUser
 */
export const requireAdmin = (req, res, next) => {
  if (!req.prismaUser) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  if (req.prismaUser.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }

  next();
};

/**
 * Require authenticated user - must run after attachClerkUser
 */
export const requireAuthenticated = (req, res, next) => {
  if (!req.prismaUser) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }
  next();
};

/**
 * Optional authentication - doesn't fail if no auth
 * Similar to old optionalAuth but using Clerk
 */
export const optionalAuth = async (req, res, next) => {
  try {
    if (req.auth && req.auth.userId) {
      // User is authenticated, attach user data
      await attachClerkUser(req, res, () => {
        // Continue even if attachClerkUser sets user
        next();
      });
    } else {
      // No auth, continue without user
      req.prismaUser = null;
      req.user = null;
      next();
    }
  } catch (error) {
    // On error, continue without auth
    req.prismaUser = null;
    req.user = null;
    next();
  }
};

