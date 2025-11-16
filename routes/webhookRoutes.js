import express from 'express';
import { Webhook } from 'svix';
import { inngest } from '../inngest/client.js';

const router = express.Router();

/**
 * Clerk webhook endpoint
 * Verifies webhook signature using Svix and enqueues Inngest event
 */
router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
      console.error('❌ CLERK_WEBHOOK_SECRET is not set');
      return res.status(500).json({
        success: false,
        message: 'Webhook secret not configured',
      });
    }

    // Get headers
    const svix_id = req.headers['svix-id'];
    const svix_timestamp = req.headers['svix-timestamp'];
    const svix_signature = req.headers['svix-signature'];

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing svix headers',
      });
    }

    // Get raw body for verification
    const payload = req.body.toString();

    // Create Svix webhook instance
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt;

    try {
      // Verify webhook signature
      evt = wh.verify(payload, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      });
    } catch (err) {
      console.error('❌ Webhook verification failed:', err.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature',
      });
    }

    // Extract event type and data
    const { type, data } = evt;

    // Only process user-related events
    if (type.startsWith('user.')) {
      // Enqueue Inngest event for background processing
      await inngest.send({
        name: 'clerk/user.sync',
        data: {
          type,
          data,
        },
      });

      console.log(`✅ Enqueued Inngest event for ${type}`);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook received',
      event: type,
    });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;

