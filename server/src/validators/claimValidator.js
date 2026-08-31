import { z } from 'zod';

export const claimSchema = z.object({
  matchId: z.string().min(1, 'Match ID is required'),
  verificationDetails: z.string().min(10, 'Verification details must be at least 10 characters')
});
