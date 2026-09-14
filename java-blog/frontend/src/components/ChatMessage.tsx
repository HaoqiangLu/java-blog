import type { ChatMessage as ChatMessageType } from '../api/types';
import { useAuthStore } from '../stores/authStore';

export function ChatMessage({ message }: { message: ChatMessageType }) {
    const currentUserId = useAuthStore((s) => s.user?.id);
    const isOwn = message.sender_id === currentUserId;
    const isSystem = message.message_type === 'system';

    if (isSystem) {
        return (
            <div className="text-center text-xs text-gray-400 py-1">{message.content}</div>
        );
    }

    return (
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                isOwn
                    ? 'bg-primary-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
            }`}>
                {!isOwn && (
                    <p className="text-xs font-medium mb-1 opacity-70">{message.sender_name}</p>
                )}
                <p className="text-sm break-words">{message.content}</p>
                <p className={`text-xs mt-1 ${isOwn ? 'text-primary-200' : 'text-gray-400'}`}>
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
            </div>
        </div>
    );
}