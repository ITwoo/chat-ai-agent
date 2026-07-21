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

export type ExpenseUpdateApprovalRequest = z.infer<
    typeof expenseUpdateApprovalRequestSchema
>;

export const updateExpenseDecisionSchema =
    z.discriminatedUnion('action', [
        z.object({
            action: z.literal('approve'),
        }),

        z.object({
            action: z.literal('cancel'),
        }),

        z.object({
            action: z.literal('revise'),
            content: z
                .string()
                .trim()
                .min(1),
        }),
    ]);

export type UpdateExpenseDecision = z.infer<
    typeof updateExpenseDecisionSchema
>;

export const agentApprovalResponseSchema = z.object({
    roomId: z.number().int().positive(),
    userMessageId: z.number().int().positive(),
    approvalId: z.uuidv4(),
    action: z.enum(['approve', 'cancel']),
});

export type AgentApprovalResponse = z.infer<
    typeof agentApprovalResponseSchema
>;

export const approvalIntentSchema = z.object({
    intent: z
        .enum([
            'approve',
            'cancel',
            'revise',
            'unclear',
        ])
        .describe(
            '현재 승인 제안을 그대로 실행하면 approve, 취소하면 cancel, 내용을 변경하면 revise, 의미가 불명확하면 unclear',
        ),
});

export type ApprovalIntent = z.infer<
    typeof approvalIntentSchema
>;