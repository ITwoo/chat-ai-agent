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

export type ExpenseDeleteApprovalRequest = {
    type: 'expense_delete_approval';
    action: 'delete_expense';
    message: string;

    expense: {
        id: number;
        amount: number;
        category: string;
        title: string;
        memo: string | null;
        spentAt: string;
    };
};

export type ScheduleUpdateApprovalRequest = {
    type: 'schedule_update_approval';
    action: 'update_schedule';
    message: string;

    schedule: {
        id: number;
        title: string;
        memo: string | null;
        location: string | null;
        startsAt: string;
        endsAt: string | null;
    };

    changes: {
        title?: string;
        memo?: string | null;
        location?: string | null;
        startsAt?: string;
        endsAt?: string | null;
    };
};

export type ScheduleDeleteApprovalRequest = {
    type: 'schedule_delete_approval';
    action: 'delete_schedule';
    message: string;

    schedule: {
        id: number;
        title: string;
        memo: string | null;
        location: string | null;
        startsAt: string;
        endsAt: string | null;
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
    | ExpenseDeleteApprovalRequest
    | ScheduleUpdateApprovalRequest
    | ScheduleDeleteApprovalRequest
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