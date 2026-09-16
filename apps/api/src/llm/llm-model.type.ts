import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type ToolCallingChatModel = BaseChatModel & {
    bindTools: NonNullable<BaseChatModel['bindTools']>;
};