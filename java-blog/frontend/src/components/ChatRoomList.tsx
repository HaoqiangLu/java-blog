import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useCreateChatRoom, useDeleteChatRoom } from '../api/queries';

export function ChatRoomList() {
    const { rooms, unreadCounts, activeRoomId } = useChatStore();
    const currentUser = useAuthStore((s) => s.user);
    const createRoom = useCreateChatRoom();
    const deleteRoom = useDeleteChatRoom();

    // 创建房间表单状态
    const [showForm, setShowForm] = useState(false);
    const [roomName, setRoomName] = useState('');
    const [roomDesc, setRoomDesc] = useState('');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomName.trim()) return;
        await createRoom.mutateAsync({ name: roomName.trim(), description: roomDesc.trim() });
        // 创建成功后重置表单
        setRoomName('');
        setRoomDesc('');
        setShowForm(false);
    };

    const handleDelete = async (e: React.MouseEvent, roomId: string) => {
        e.preventDefault();          // 阻止 Link 跳转
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this room?')) return;
        await deleteRoom.mutateAsync(roomId);
    };

    return (
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Chat Rooms</h2>
                {/* 创建房间按钮 */}
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-600 text-white text-sm hover:bg-primary-700 transition-colors"
                    title="Create room"
                >
                    {showForm ? '×' : '+'}
                </button>
            </div>

            {/* 创建房间表单 */}
            {showForm && (
                <form onSubmit={handleCreate} className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-2">
                    <input
                        type="text"
                        placeholder="Room name"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500"
                        required
                    />
                    <input
                        type="text"
                        placeholder="Description (optional)"
                        value={roomDesc}
                        onChange={(e) => setRoomDesc(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                        type="submit"
                        disabled={createRoom.isPending}
                        className="w-full py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                    >
                        {createRoom.isPending ? 'Creating...' : 'Create'}
                    </button>
                </form>
            )}

            {/* 房间列表 */}
            <div className="space-y-1">
                {rooms.map((room) => (
                    <Link
                        key={room.id}
                        to={`/chat/${room.id}`}
                        className={`block px-3 py-2 rounded-lg transition-colors ${
                            activeRoomId === room.id
                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                    >
                        <div className="flex justify-between items-center">
                            <span className="font-medium truncate">{room.name}</span>
                            <div className="flex items-center gap-1">
                                {(unreadCounts[room.id] || 0) > 0 && (
                                    <span className="px-2 py-0.5 text-xs bg-primary-600 text-white rounded-full">
                    {unreadCounts[room.id]}
                  </span>
                                )}
                                {/* 删除按钮 — 仅创建者可见 */}
                                {currentUser?.id === room.created_by && (
                                    <button
                                        onClick={(e) => handleDelete(e, room.id)}
                                        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                                        title="Delete room"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        </div>
                        {room.last_message && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">{room.last_message}</p>
                        )}
                    </Link>
                ))}
            </div>
        </div>
    );
}