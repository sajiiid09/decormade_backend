import { inngest } from '../client.js';
import prisma from '../../config/db.js';

/**
 * Inngest function to sync Clerk user data to Prisma
 * Triggered by Clerk webhook events
 */
export const syncClerkUser = inngest.createFunction(
  { id: 'sync-clerk-user' },
  { event: 'clerk/user.sync' },
  async ({ event, step }) => {
    const { data, type } = event.data;

    return await step.run('sync-user', async () => {
      if (type === 'user.deleted') {
        // Delete user from Prisma when deleted in Clerk
        try {
          await prisma.user.delete({
            where: { id: data.id },
          });
          console.log(`✅ Deleted user ${data.id} from Prisma`);
          return { success: true, action: 'deleted', userId: data.id };
        } catch (error) {
          // User might not exist, that's okay
          if (error.code === 'P2025') {
            console.log(`User ${data.id} not found in Prisma, skipping delete`);
            return { success: true, action: 'not_found', userId: data.id };
          }
          throw error;
        }
      }

      // For user.created, user.updated events
      const userId = data.id;
      const email = data.email_addresses?.[0]?.email_address || data.primary_email_address_id || '';
      const firstName = data.first_name || null;
      const lastName = data.last_name || null;
      const profilePicture = data.image_url || null;

      // Upsert user in Prisma
      const user = await prisma.user.upsert({
        where: { id: userId },
        update: {
          email: email || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          profilePicture: profilePicture || undefined,
          updatedAt: new Date(),
        },
        create: {
          id: userId,
          email: email || '',
          firstName: firstName || null,
          lastName: lastName || null,
          profilePicture: profilePicture || null,
          role: 'CUSTOMER', // Default role
          isActive: true,
          loginCount: 0,
        },
      });

      console.log(`✅ Synced user ${userId} to Prisma`);
      return { success: true, action: type, userId, email: user.email };
    });
  }
);

// Export all Inngest functions for registration
export const inngestFunctions = [syncClerkUser];

