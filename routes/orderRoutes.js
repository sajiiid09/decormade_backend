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

// Admin routes (must come before /:id routes to avoid conflicts)
router.get('/admin/all', requireAuthenticated, requireAdmin, getAllOrders);
router.get('/admin/stats', requireAuthenticated, requireAdmin, getOrderStats);

// User routes (require authentication)
router.post('/', requireAuthenticated, createOrder);
router.get('/', requireAuthenticated, getUserOrders);
router.put('/:id/status', requireAuthenticated, requireAdmin, updateOrderStatus);
router.put('/:id/shipping', requireAuthenticated, requireAdmin, addShippingInfo);
router.put('/:id/delivered', requireAuthenticated, requireAdmin, markOrderDelivered);
router.put('/:id/cancel', requireAuthenticated, cancelOrder);
router.get('/:id', requireAuthenticated, getOrder);

export default router;
