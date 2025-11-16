import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  addUserAddress,
  updateUserAddress,
  deleteUserAddress,
  getUserOrdersSummary,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserStats,
} from '../controllers/userController.js';
import { requireAdmin } from '../middleware/clerkAuth.js';

const router = express.Router();

// Middleware to require authentication
const requireAuthenticated = (req, res, next) => {
  if (!req.prismaUser) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }
  next();
};

// User profile routes (require authentication)
router.get('/profile', requireAuthenticated, getUserProfile);
router.put('/profile', requireAuthenticated, updateUserProfile);
router.get('/orders-summary', requireAuthenticated, getUserOrdersSummary);

// Address management routes (require authentication)
router.post('/addresses', requireAuthenticated, addUserAddress);
router.put('/addresses/:addressId', requireAuthenticated, updateUserAddress);
router.delete('/addresses/:addressId', requireAuthenticated, deleteUserAddress);

// Admin routes (require authentication + admin role)
router.get('/admin/all', requireAuthenticated, requireAdmin, getAllUsers);
router.get('/admin/stats', requireAuthenticated, requireAdmin, getUserStats);
router.get('/admin/:id', requireAuthenticated, requireAdmin, getUserById);
router.put('/admin/:id', requireAuthenticated, requireAdmin, updateUser);
router.delete('/admin/:id', requireAuthenticated, requireAdmin, deleteUser);

export default router;
