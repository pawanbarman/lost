import { z } from "zod";

const dateTimeField = z.string().or(z.date());

export const reportSchema = z.object({
  type: z.enum(["LOST", "FOUND"]),
  title: z.string().min(2, "Item name is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  location: z.string().min(2, "Location is required"),
  dateTime: dateTimeField,
  eventId: z.string().optional(),
  communityId: z.string().optional(),
  privateDetails: z.string().optional(),
  currentLocation: z.string().optional(),
  color: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  uniqueFeatures: z.string().optional(),
  condition: z.string().optional(),
  size: z.string().optional(),
});

export const updateReportSchema = z.object({
  title: z.string().min(2).optional(),
  category: z.string().min(1).optional(),
  description: z.string().min(10).optional(),
  location: z.string().min(2).optional(),
  dateTime: dateTimeField.optional(),
  communityId: z.string().optional(),
  privateDetails: z.string().optional(),
  currentLocation: z.string().optional(),
  color: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  uniqueFeatures: z.string().optional(),
  condition: z.string().optional(),
  size: z.string().optional(),
});