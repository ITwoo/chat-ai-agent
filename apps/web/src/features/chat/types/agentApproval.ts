export type AgentApprovalAction =
    | 'approve'
    | 'cancel'
    | 'revise';

export type ExpenseUpdateApprovalRequest = {
    type: 'expense_update_approval';
    action: 'update_expense';
    message: string;

    expense: {
        id: number;
        amount: number;
        category: string;
        title: string;
        memo: string | null;
        spentAt: string;
    };

    changes: {
        amount?: number;
        category?: string;
        title?: string;
        memo?: string | null;
        spentAt?: string;
    };
};

export type UserMemoryDeleteApprovalRequest = {
    type: 'user_memory_delete_approval';
    action: 'delete_user_memory';
    message: string;
    memory: {
        id: number;
        type:
            | 'PROFILE'
            | 'PREFERENCE'
            | 'GOAL'
            | 'CONSTRAINT';
        memoryKey: string;
        content: string;
    };
};

export type AgentApprovalRequest =
    | ExpenseUpdateApprovalRequest
    | UserMemoryDeleteApprovalRequest;

export type PendingAgentApproval = {
    roomId: number;
    approvalId: string;
    userMessageId: number;
    request: AgentApprovalRequest;
};

export type AgentApprovalResolvedEvent = {
    roomId: number;
    approvalId: string;
    userMessageId: number;
    action: AgentApprovalAction;
}