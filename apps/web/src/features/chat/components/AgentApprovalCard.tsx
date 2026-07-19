import type {
    AgentApprovalAction,
    ExpenseUpdateApprovalRequest,
    PendingAgentApproval,
} from '../types/agentApproval';

type AgentApprovalCardProps = {
    approval: PendingAgentApproval;
    disabled: boolean;
    onRespond: (
        action: AgentApprovalAction,
    ) => void;
};

type ApprovalChange = {
    label: string;
    before: string;
    after: string;
};

function formatAmount(amount: number): string {
    return `${amount.toLocaleString('ko-KR')}원`;
}

function formatMemo(
    memo: string | null,
): string {
    return memo?.trim() || '없음';
}

function formatSpentAt(
    spentAt: string,
): string {
    const date = new Date(spentAt);

    if (Number.isNaN(date.getTime())) {
        return spentAt;
    }

    return date.toLocaleString('ko-KR');
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
            before: formatSpentAt(
                expense.spentAt,
            ),
            after: formatSpentAt(
                changes.spentAt,
            ),
        });
    }

    return result;
}

export function AgentApprovalCard({
    approval,
    disabled,
    onRespond,
}: AgentApprovalCardProps) {
    const changes = createApprovalChanges(
        approval.request,
    );

    return (
        <section className="shrink-0 border-t bg-gray-50 px-4 py-4 md:px-6">
            <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
                <div>
                    <p className="text-sm font-bold text-gray-900">
                        수정 승인 필요
                    </p>

                    <p className="mt-1 text-sm text-gray-600">
                        {approval.request.message}
                    </p>
                </div>

                <div className="mt-4 rounded-lg bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">
                        {approval.request.expense.title}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                        지출 ID:{' '}
                        {approval.request.expense.id}
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
                    버튼을 누르거나 채팅으로
                    ‘승인’ 또는 ‘취소’를 입력할 수
                    있습니다.
                </p>

                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                            onRespond('cancel')
                        }
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        취소
                    </button>

                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                            onRespond('approve')
                        }
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        승인
                    </button>
                </div>
            </div>
        </section>
    );
}