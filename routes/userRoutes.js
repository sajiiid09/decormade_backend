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
  getUserStats
} from '../controllers/userController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// User profile routes
router.get('/profile', authenticateToken, getUserProfile);
router.put('/profile', authenticateToken, updateUserProfile);
router.get('/orders-summary', authenticateToken, getUserOrdersSummary);

// Address management routes
router.post('/addresses', authenticateToken, addUserAddress);
router.put('/addresses/:addressId', authenticateToken, updateUserAddress);
router.delete('/addresses/:addressId', authenticateToken, deleteUserAddress);

// Admin routes
router.get('/admin/all', authenticateToken, requireAdmin, getAllUsers);
router.get('/admin/stats', authenticateToken, requireAdmin, getUserStats);
router.get('/admin/:id', authenticateToken, requireAdmin, getUserById);
router.put('/admin/:id', authenticateToken, requireAdmin, updateUser);
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteUser);

export default router;
