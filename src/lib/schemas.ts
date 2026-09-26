import { z } from "zod";

export const emailOutputSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
});

export type EmailOutput = z.infer<typeof emailOutputSchema>;

export const grammarIssueSchema = z.object({
  original: z.string(),
  suggestion: z.string(),
  reason: z.string(),
});

export const grammarOutputSchema = z.object({
  corrected: z.string(),
  issues: z.array(grammarIssueSchema),
});

export type GrammarOutput = z.infer<typeof grammarOutputSchema>;

export const resumeOutputSchema = z.object({
  overallScore: z.number().min(0).max(100),
  strengths: z.array(z.string()).min(1),
  gaps: z.array(z.string()).min(1),
  hireRecommendation: z.enum(["strong_yes", "yes", "maybe", "no"]),
  summary: z.string().min(1),
});

export type ResumeOutput = z.infer<typeof resumeOutputSchema>;

export const blogOutputSchema = z.object({
  title: z.string().min(1),
  outline: z.array(z.string()).min(2),
  draft: z.string().min(1),
});

export type BlogOutput = z.infer<typeof blogOutputSchema>;

export const invoiceSchema = z.object({
  type: z.literal("invoice"),
  vendor: z.string().min(1),
  invoiceNumber: z.string().min(1),
  date: z.string().min(1),
  total: z.number(),
  currency: z.string().min(1),
  lineItems: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
    })
  ),
});

export const formSchema = z.object({
  type: z.literal("form"),
  formName: z.string().min(1),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export const extractionSchema = z.discriminatedUnion("type", [
  invoiceSchema,
  formSchema,
]);

export type ExtractionOutput = z.infer<typeof extractionSchema>;

export const meetingOutputSchema = z.object({
  summary: z.string().min(1),
  tasks: z.array(z.string()),
  decisions: z.array(z.string()).optional(),
});

export type MeetingOutput = z.infer<typeof meetingOutputSchema>;

export const supportDraftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  tone: z.string().optional(),
});

export type SupportDraft = z.infer<typeof supportDraftSchema>;
