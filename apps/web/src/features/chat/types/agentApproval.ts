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

export type PendingAgentApproval = {
    roomId: number;
    userMessageId: number;
    request: ExpenseUpdateApprovalRequest;
};

export type AgentApprovalResolvedEvent = {
    roomId: number;
    userMessageId: number;
    action: AgentApprovalAction;
}