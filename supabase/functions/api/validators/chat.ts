import { z } from "zod";

export const createConversationSchema = z.object({
  reportId: z.string().trim().min(1, "Report ID is required"),
});

export const sendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .max(2000, "Message body is too long")
    .optional(),
  imageUrl: z
    .string()
    .trim()
    .url("Invalid image URL")
    .optional(),
  clientId: z.string().trim().min(1, "Client ID is required").optional(),
}).refine(
  (data) => (data.body && data.body.length > 0) || (data.imageUrl && data.imageUrl.length > 0),
  {
    message: "A message must have either body text or an image",
    path: ["body"],
  },
);

export const reportMessageSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Report reason is required")
    .max(500, "Reason is too long"),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ReportMessageInput = z.infer<typeof reportMessageSchema>;