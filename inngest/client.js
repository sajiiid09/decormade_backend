import { Inngest } from 'inngest';

// Initialize Inngest client
// If INNGEST_EVENT_KEY is not set, Inngest will work in development mode
export const inngest = new Inngest({
  id: 'decormade',
  ...(process.env.INNGEST_EVENT_KEY && { eventKey: process.env.INNGEST_EVENT_KEY }),
});

export default inngest;

