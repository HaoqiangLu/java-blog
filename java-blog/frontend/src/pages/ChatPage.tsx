// [WebSocket] 实时聊天界面 — 消息列表 + 输入框 + 房间侧边栏
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useChatStore } from '../stores/chatStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { ChatMessage } from '../components/ChatMessage';
import { ChatRoomList } from '../components/ChatRoomList';
import { useUIStore } from '../stores/uiStore';
import { useChatRooms } from '../api/queries';

export function ChatPage() {
    const { roomId } = useParams<{ roomId: string }>();
    const { activeRoomId, setActiveRoom, messages, clearUnread, setRooms } = useChatStore();
    const { joinRoom, leaveRoom, sendChatMessage, isConnected } = useWebSocket();
    const { chatSidebarOpen } = useUIStore();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // [TanStack Query] 加载聊天室列表
    const { data: rooms } = useChatRooms();

    // 房间列表加载后同步到 Zustand Store
    useEffect(() => {
        if (rooms) {
            setRooms(rooms);
        }
    }, [rooms]);

    // 切换房间
    useEffect(() => {
        if (roomId && roomId !== activeRoomId) {
            if (activeRoomId) leaveRoom(activeRoomId);
            setActiveRoom(roomId);
            joinRoom(roomId);
            clearUnread(roomId);
        }
        return () => {
            if (activeRoomId) leaveRoom(activeRoomId);
        };
    }, [roomId]);

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, activeRoomId]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !activeRoomId) return;
        sendChatMessage(activeRoomId, input.trim());
        setInput('');
    };

    const currentMessages = activeRoomId ? (messages[activeRoomId] || []) : [];

    return (
        <div className="flex h-[calc(100vh-6rem)] bg-white dark:bg-gray-800 rounded-xl shadow">
            {/* [TailwindCSS] 房间侧边栏 — 响应式显隐 */}
            <div className={`${chatSidebarOpen ? 'block' : 'hidden'} md:block w-64 border-r border-gray-200 dark:border-gray-700`}>
                <ChatRoomList />
            </div>

            {/* 聊天主区域 */}
            <div className="flex-1 flex flex-col">
                {/* 连接状态指示 */}
                <div className={`px-4 py-2 text-xs ${isConnected ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {isConnected ? 'Connected' : 'Disconnected — reconnecting...'}
                </div>

                {/* 消息列表 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {currentMessages.map((msg) => (
                        <ChatMessage key={msg.id} message={msg} />
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* 输入框 */}
                <form onSubmit={handleSend} className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={activeRoomId ? 'Type a message...' : 'Select a room'}
                            disabled={!activeRoomId || !isConnected}
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                        />
                        <button type="submit" disabled={!input.trim() || !isConnected}
                                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                            Send
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}