import { z } from 'zod';

export const expenseUpdateApprovalRequestSchema = z.object({
    type: z.literal('expense_update_approval'),
    action: z.literal('update_expense'),
    message: z.string(),
    expense: z.object({
        id: z.number().int().positive(),
        amount: z.number().int().positive(),
        category: z.string(),
        title: z.string(),
        memo: z.string().nullable(),
        spentAt: z.string(),
    }),
    changes: z.object({
        amount: z.number().int().positive().optional(),
        category: z.string().optional(),
        title: z.string().optional(),
        memo: z.string().nullable().optional(),
        spentAt: z.string().optional(),
    }),
});

export const updateExpenseDecisionSchema = z.object({
    action: z.enum(['approve', 'cancel']),
});

export type ExpenseUpdateApprovalRequest = z.infer<
    typeof expenseUpdateApprovalRequestSchema
>;

export type UpdateExpenseDecision = z.infer<
    typeof updateExpenseDecisionSchema
>;

export const agentApprovalResponseSchema = z.object({
    roomId: z.number().int().positive(),
    userMessageId: z.number().int().positive(),
    action: updateExpenseDecisionSchema.shape.action,
});

export type AgentApprovalResponse = z.infer<
    typeof agentApprovalResponseSchema
>;