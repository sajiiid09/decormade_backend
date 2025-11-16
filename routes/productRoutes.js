import express from 'express';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  addProductReview,
  updateProductReview,
  deleteProductReview,
  getProductCategories,
  getFeaturedProducts,
  getRelatedProducts
} from '../controllers/productController.js';
import { requireAdmin, optionalAuth } from '../middleware/clerkAuth.js';

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

// Public routes (optional authentication)
router.get('/', optionalAuth, getProducts);
router.get('/categories', getProductCategories);
router.get('/featured', getFeaturedProducts);
router.get('/:id', optionalAuth, getProduct);
router.get('/:id/related', getRelatedProducts);

// Protected routes (require authentication)
router.post('/:id/reviews', requireAuthenticated, addProductReview);
router.put('/:id/reviews/:reviewId', requireAuthenticated, updateProductReview);
router.delete('/:id/reviews/:reviewId', requireAuthenticated, deleteProductReview);

// Admin routes (require authentication + admin role)
router.post('/', requireAuthenticated, requireAdmin, createProduct);
router.put('/:id', requireAuthenticated, requireAdmin, updateProduct);
router.delete('/:id', requireAuthenticated, requireAdmin, deleteProduct);

export default router;
