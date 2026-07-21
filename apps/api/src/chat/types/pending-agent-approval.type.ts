import type {
    ExpenseUpdateApprovalRequest,
} from '../../agent/agent-interrupt.schema';

export type PendingAgentApproval = {
    approvalId: string;
    threadId: string;
    originUserMessageId: number;
    request: ExpenseUpdateApprovalRequest;
};