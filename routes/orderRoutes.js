import express from 'express';
import {
  createOrder,
  getUserOrders,
  getOrder,
  updateOrderStatus,
  addShippingInfo,
  markOrderDelivered,
  cancelOrder,
  getAllOrders,
  getOrderStats
} from '../controllers/orderController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Admin routes (must come before /:id routes to avoid conflicts)
router.get('/admin/all', authenticateToken, requireAdmin, getAllOrders);
router.get('/admin/stats', authenticateToken, requireAdmin, getOrderStats);

// User routes
router.post('/', authenticateToken, createOrder);
router.get('/', authenticateToken, getUserOrders);
router.put('/:id/status', authenticateToken, requireAdmin, updateOrderStatus);
router.put('/:id/shipping', authenticateToken, requireAdmin, addShippingInfo);
router.put('/:id/delivered', authenticateToken, requireAdmin, markOrderDelivered);
router.put('/:id/cancel', authenticateToken, cancelOrder);
router.get('/:id', authenticateToken, getOrder);

export default router;
