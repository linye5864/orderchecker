import { z } from "zod";

/**
 * Domain: Upload
 */
export const UploadFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
  createdAt: z.string()
});

export type UploadFile = z.infer<typeof UploadFileSchema>;

/**
 * Domain: Reconciliation start
 */
export const ReconcileStartSchema = z.object({
  files: z.array(UploadFileSchema),
  rulesetId: z.string().optional()
});

export type ReconcileStartInput = z.infer<typeof ReconcileStartSchema>;

/**
 * Domain: Results
 *
 * Notes:
 * - This is an MVP schema meant to support the UI requirements in PRD FR-006 and the UI design spec.
 * - It models 3-way reconciliation among: delivery sheet (dispatch), platform statement, and fund/transaction statement.
 * - Monetary fields are integers in the smallest currency unit (e.g. cents) to avoid floating point errors.
 */

export const MoneyCentsSchema = z.number().int();

export const PlatformIdSchema = z.string().min(1);
export type PlatformId = z.infer<typeof PlatformIdSchema>;

export const ReconcileStatusSchema = z.enum(["matched", "exception", "unknown"]);
export type ReconcileStatus = z.infer<typeof ReconcileStatusSchema>;

export const ExceptionReasonSchema = z.enum([
  "amount_mismatch",
  "missing_in_dispatch",
  "missing_in_platform",
  "missing_in_fund",
  "duplicate_order",
  "date_mismatch",
  "other"
]);
export type ExceptionReason = z.infer<typeof ExceptionReasonSchema>;

export const PartyAmountsSchema = z.object({
  /** Delivery sheet (配送单/业务侧) */
  dispatch: MoneyCentsSchema.nullable().optional(),
  /** Platform statement (平台账单) */
  platform: MoneyCentsSchema.nullable().optional(),
  /** Fund/transaction statement (流水账单/资金侧) */
  fund: MoneyCentsSchema.nullable().optional()
});
export type PartyAmounts = z.infer<typeof PartyAmountsSchema>;

export const ResultsSummarySchema = z.object({
  totalOrders: z.number().int().nonnegative(),
  matchedOrders: z.number().int().nonnegative(),
  exceptionOrders: z.number().int().nonnegative(),
  totalAmount: MoneyCentsSchema.nonnegative(),

  /** Optional aggregate of each party, useful for the 3-way comparison table */
  totalsByParty: PartyAmountsSchema.optional()
});
export type ResultsSummary = z.infer<typeof ResultsSummarySchema>;

export const OrderRowSchema = z.object({
  id: z.string().min(1),

  /**
   * Business order identifier shown in tables.
   * Different platforms may use different columns; this is the normalized value.
   */
  orderNo: z.string().min(1),

  platformId: PlatformIdSchema,

  /** ISO datetime or ISO date string from source data after normalization */
  occurredAt: z.string().optional(),

  status: ReconcileStatusSchema,
  exceptionReasons: z.array(ExceptionReasonSchema).default([]),

  amounts: PartyAmountsSchema,

  /**
   * Raw references (e.g. row ids / source sheet names) for tracing.
   * Keep loose typing for MVP.
   */
  sourceRefs: z.record(z.string(), z.string()).optional()
});
export type OrderRow = z.infer<typeof OrderRowSchema>;

export const PlatformResultsSchema = z.object({
  platformId: PlatformIdSchema,
  summary: ResultsSummarySchema,
  orders: z.array(OrderRowSchema)
});
export type PlatformResults = z.infer<typeof PlatformResultsSchema>;

export const ResultsReportSchema = z.object({
  reportId: z.string().min(1),
  generatedAt: z.string(),

  summary: ResultsSummarySchema,

  /** Per-platform tabs */
  platforms: z.array(PlatformResultsSchema)
});
export type ResultsReport = z.infer<typeof ResultsReportSchema>;
