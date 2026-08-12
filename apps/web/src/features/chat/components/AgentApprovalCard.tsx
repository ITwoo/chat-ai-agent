import type {
    AgentApprovalAction,
    ExpenseDeleteApprovalRequest,
    ExpenseUpdateApprovalRequest,
    PendingAgentApproval,
    ScheduleDeleteApprovalRequest,
    ScheduleUpdateApprovalRequest,
    UserMemoryDeleteApprovalRequest,
} from '../types/agentApproval';

type AgentApprovalCardProps = {
    approval: PendingAgentApproval;
    disabled: boolean;
    onRespond: (action: AgentApprovalAction) => void;
};

type ApprovalCardContentProps = {
    disabled: boolean;
    onRespond: (action: AgentApprovalAction) => void;
};

type ExpenseApprovalCardProps = ApprovalCardContentProps & {
    request: ExpenseUpdateApprovalRequest;
};

type ExpenseDeleteApprovalCardProps = ApprovalCardContentProps & {
    request: ExpenseDeleteApprovalRequest;
};

type UserMemoryDeleteApprovalCardProps =
    ApprovalCardContentProps & {
        request: UserMemoryDeleteApprovalRequest;
    };

type ScheduleApprovalCardProps = ApprovalCardContentProps & {
    request: ScheduleUpdateApprovalRequest;
};

type ScheduleDeleteApprovalCardProps = ApprovalCardContentProps & {
    request: ScheduleDeleteApprovalRequest;
};

type ApprovalChange = {
    label: string;
    before: string;
    after: string;
};

function formatAmount(amount: number): string {
    return `${amount.toLocaleString('ko-KR')}원`;
}

function formatMemo(memo: string | null): string {
    return memo?.trim() || '없음';
}

function formatSpentAt(spentAt: string): string {
    const date = new Date(spentAt);

    if (Number.isNaN(date.getTime())) {
        return spentAt;
    }

    return date.toLocaleString('ko-KR');
}

function formatMemoryType(
    type: UserMemoryDeleteApprovalRequest['memory']['type'],
): string {
    const labels = {
        PROFILE: '사용자 정보',
        PREFERENCE: '선호',
        GOAL: '목표',
        CONSTRAINT: '제약',
    } as const;

    return labels[type];
}

function createApprovalChanges(
    request: ExpenseUpdateApprovalRequest,
): ApprovalChange[] {
    const { expense, changes } = request;
    const result: ApprovalChange[] = [];

    if (changes.amount !== undefined) {
        result.push({
            label: '금액',
            before: formatAmount(expense.amount),
            after: formatAmount(changes.amount),
        });
    }

    if (changes.category !== undefined) {
        result.push({
            label: '카테고리',
            before: expense.category,
            after: changes.category,
        });
    }

    if (changes.title !== undefined) {
        result.push({
            label: '제목',
            before: expense.title,
            after: changes.title,
        });
    }

    if (changes.memo !== undefined) {
        result.push({
            label: '메모',
            before: formatMemo(expense.memo),
            after: formatMemo(changes.memo),
        });
    }

    if (changes.spentAt !== undefined) {
        result.push({
            label: '지출 일시',
            before: formatSpentAt(expense.spentAt),
            after: formatSpentAt(changes.spentAt),
        });
    }

    return result;
}

function ApprovalButtons({
    disabled,
    approveLabel,
    approveButtonClassName,
    onRespond,
}: ApprovalCardContentProps & {
    approveLabel: string;
    approveButtonClassName: string;
}) {
    return (
        <div className="mt-4 flex justify-end gap-2">
            <button
                type="button"
                disabled={disabled}
                onClick={() => onRespond('cancel')}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
                취소
            </button>

            <button
                type="button"
                disabled={disabled}
                onClick={() => onRespond('approve')}
                className={approveButtonClassName}
            >
                {approveLabel}
            </button>
        </div>
    );
}

function ExpenseUpdateApprovalCard({
    request,
    disabled,
    onRespond,
}: ExpenseApprovalCardProps) {
    const changes = createApprovalChanges(request);

    return (
        <section className="shrink-0 border-t bg-gray-50 px-4 py-4 md:px-6">
            <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-900">
                    수정 승인 필요
                </p>

                <p className="mt-1 text-sm text-gray-600">
                    {request.message}
                </p>

                <div className="mt-4 rounded-lg bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">
                        {request.expense.title}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                        지출 ID: {request.expense.id}
                    </p>

                    <div className="mt-3 space-y-2">
                        {changes.map((change) => (
                            <div
                                key={change.label}
                                className="grid grid-cols-[80px_1fr] gap-3 text-sm"
                            >
                                <span className="font-medium text-gray-500">
                                    {change.label}
                                </span>

                                <span className="min-w-0 text-gray-800">
                                    <span className="break-words line-through">
                                        {change.before}
                                    </span>

                                    <span className="mx-2 text-gray-400">
                                        →
                                    </span>

                                    <span className="break-words font-semibold">
                                        {change.after}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="mt-3 text-xs text-gray-500">
                    버튼을 누르거나 채팅으로 ‘승인’ 또는 ‘취소’를
                    입력할 수 있습니다.
                </p>

                <ApprovalButtons
                    disabled={disabled}
                    onRespond={onRespond}
                    approveLabel="승인"
                    approveButtonClassName="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>
        </section>
    );
}

function ExpenseDeleteApprovalCard({
    request,
    disabled,
    onRespond,
}: ExpenseDeleteApprovalCardProps) {
    const { expense } = request;

    return (
        <section className="shrink-0 border-t bg-gray-50 px-4 py-4 md:px-6">
            <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-900">
                    지출 삭제 승인 필요
                </p>

                <p className="mt-1 text-sm text-gray-600">
                    {request.message}
                </p>

                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
                    <p className="font-semibold text-gray-900">
                        {expense.title}
                    </p>
                    <p>금액: {formatAmount(expense.amount)}</p>
                    <p>카테고리: {expense.category}</p>
                    <p>지출 일시: {formatSpentAt(expense.spentAt)}</p>
                </div>

                <ApprovalButtons
                    disabled={disabled}
                    onRespond={onRespond}
                    approveLabel="삭제"
                    approveButtonClassName="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>
        </section>
    );
}

function ScheduleUpdateApprovalCard({
    request,
    disabled,
    onRespond,
}: ScheduleApprovalCardProps) {
    const { schedule, changes } = request;

    return (
        <section className="shrink-0 border-t bg-gray-50 px-4 py-4 md:px-6">
            <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-900">
                    일정 수정 승인 필요
                </p>

                <p className="mt-1 text-sm text-gray-600">
                    {request.message}
                </p>

                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
                    <p className="font-semibold text-gray-900">
                        {schedule.title}
                    </p>

                    {changes.title !== undefined && (
                        <p>제목: {schedule.title} → {changes.title}</p>
                    )}

                    {changes.location !== undefined && (
                        <p>
                            장소: {schedule.location ?? '없음'} →{' '}
                            {changes.location ?? '없음'}
                        </p>
                    )}

                    {changes.startsAt !== undefined && (
                        <p>
                            시작: {schedule.startsAt} → {changes.startsAt}
                        </p>
                    )}

                    {changes.endsAt !== undefined && (
                        <p>
                            종료: {schedule.endsAt ?? '없음'} →{' '}
                            {changes.endsAt ?? '없음'}
                        </p>
                    )}

                    {changes.memo !== undefined && (
                        <p>
                            메모: {schedule.memo ?? '없음'} →{' '}
                            {changes.memo ?? '없음'}
                        </p>
                    )}
                </div>

                <ApprovalButtons
                    disabled={disabled}
                    onRespond={onRespond}
                    approveLabel="승인"
                    approveButtonClassName="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>
        </section>
    );
}

function ScheduleDeleteApprovalCard({
    request,
    disabled,
    onRespond,
}: ScheduleDeleteApprovalCardProps) {
    const { schedule } = request;

    return (
        <section className="shrink-0 border-t bg-gray-50 px-4 py-4 md:px-6">
            <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-900">
                    일정 삭제 승인 필요
                </p>

                <p className="mt-1 text-sm text-gray-600">
                    {request.message}
                </p>

                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
                    <p className="font-semibold text-gray-900">
                        {schedule.title}
                    </p>
                    <p>장소: {schedule.location ?? '없음'}</p>
                    <p>시작: {schedule.startsAt}</p>
                    <p>종료: {schedule.endsAt ?? '없음'}</p>
                </div>

                <ApprovalButtons
                    disabled={disabled}
                    onRespond={onRespond}
                    approveLabel="삭제"
                    approveButtonClassName="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>
        </section>
    );
}

function UserMemoryDeleteApprovalCard({
    request,
    disabled,
    onRespond,
}: UserMemoryDeleteApprovalCardProps) {
    return (
        <section className="shrink-0 border-t bg-gray-50 px-4 py-4 md:px-6">
            <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-900">
                    메모리 삭제 승인 필요
                </p>

                <p className="mt-1 text-sm text-gray-600">
                    {request.message}
                </p>

                <div className="mt-4 rounded-lg bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">
                        {request.memory.content}
                    </p>

                    <div className="mt-3 space-y-2 text-sm">
                        <p>
                            <span className="font-medium text-gray-500">
                                타입
                            </span>{' '}
                            <span className="text-gray-800">
                                {formatMemoryType(
                                    request.memory.type,
                                )}
                            </span>
                        </p>

                        <p>
                            <span className="font-medium text-gray-500">
                                키
                            </span>{' '}
                            <span className="break-all text-gray-800">
                                {request.memory.memoryKey}
                            </span>
                        </p>

                        <p className="text-xs text-gray-500">
                            메모리 ID: {request.memory.id}
                        </p>
                    </div>
                </div>

                <p className="mt-3 text-xs text-gray-500">
                    삭제한 메모리는 복구되지 않습니다. 버튼을
                    누르거나 채팅으로 ‘승인’ 또는 ‘취소’를 입력할 수
                    있습니다.
                </p>

                <ApprovalButtons
                    disabled={disabled}
                    onRespond={onRespond}
                    approveLabel="삭제"
                    approveButtonClassName="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>
        </section>
    );
}

function assertNever(value: never): never {
    throw new Error(
        `지원하지 않는 승인 요청입니다: ${JSON.stringify(value)}`,
    );
}

export function AgentApprovalCard({
    approval,
    disabled,
    onRespond,
}: AgentApprovalCardProps) {
    const { request } = approval;

    switch (request.type) {
        case 'expense_update_approval':
            return (
                <ExpenseUpdateApprovalCard
                    request={request}
                    disabled={disabled}
                    onRespond={onRespond}
                />
            );

        case 'expense_delete_approval':
            return (
                <ExpenseDeleteApprovalCard
                    request={request}
                    disabled={disabled}
                    onRespond={onRespond}
                />
            );
            
        case 'schedule_update_approval':
            return (
                <ScheduleUpdateApprovalCard
                    request={request}
                    disabled={disabled}
                    onRespond={onRespond}
                />
            );

        case 'schedule_delete_approval':
            return (
                <ScheduleDeleteApprovalCard
                    request={request}
                    disabled={disabled}
                    onRespond={onRespond}
                />
            );
            
        case 'user_memory_delete_approval':
            return (
                <UserMemoryDeleteApprovalCard
                    request={request}
                    disabled={disabled}
                    onRespond={onRespond}
                />
            );

        default:
            return assertNever(request);
    }
}