import express from 'express';
import { requireAuthenticated } from '../middleware/clerkAuth.js';

const router = express.Router();

// Placeholder payment routes - to be implemented later
router.post('/create-payment-intent', requireAuthenticated, (req, res) => {
  res.json({
    success: false,
    message: 'Payment integration not implemented yet'
  });
});

router.post('/webhook', (req, res) => {
  res.json({
    success: true,
    message: 'Webhook received'
  });
});

export default router;
