// [Zustand] 聊天状态管理 — 消息、房间、未读计数
import { create } from 'zustand';
import type { ChatMessage, ChatRoom } from '../api/types';

interface ChatState {
    // 当前选中的房间
    activeRoomId: string | null;
    // 各房间消息列表
    messages: Record<string, ChatMessage[]>;
    // 房间列表
    rooms: ChatRoom[];
    // 各房间未读计数
    unreadCounts: Record<string, number>;
    // WebSocket 连接状态
    wsConnected: boolean;

    // Actions
    setActiveRoom: (roomId: string | null) => void;
    addMessage: (roomId: string, message: ChatMessage) => void;
    setMessages: (roomId: string, messages: ChatMessage[]) => void;
    prependMessages: (roomId: string, messages: ChatMessage[]) => void;
    setRooms: (rooms: ChatRoom[]) => void;
    setUnreadCount: (roomId: string, count: number) => void;
    incrementUnread: (roomId: string) => void;
    clearUnread: (roomId: string) => void;
    setWsConnected: (connected: boolean) => void;
    reset: () => void;

    removeRoom: (roomId: string) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
    activeRoomId: null,
    messages: {},
    rooms: [],
    unreadCounts: {},
    wsConnected: false,

    setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

    addMessage: (roomId, message) =>
        set((state) => ({
            messages: {
                ...state.messages,
                [roomId]: [...(state.messages[roomId] || []), message],
            },
        })),

    setMessages: (roomId, messages) =>
        set((state) => ({
            messages: { ...state.messages, [roomId]: messages },
        })),

    prependMessages: (roomId, newMessages) =>
        set((state) => ({
            messages: {
                ...state.messages,
                [roomId]: [...newMessages, ...(state.messages[roomId] || [])],
            },
        })),

    setRooms: (rooms) => set({ rooms }),

    setUnreadCount: (roomId, count) =>
        set((state) => ({
            unreadCounts: { ...state.unreadCounts, [roomId]: count },
        })),

    incrementUnread: (roomId) =>
        set((state) => ({
            unreadCounts: {
                ...state.unreadCounts,
                [roomId]: (state.unreadCounts[roomId] || 0) + 1,
            },
        })),

    clearUnread: (roomId) =>
        set((state) => ({
            unreadCounts: { ...state.unreadCounts, [roomId]: 0 },
        })),

    setWsConnected: (connected) => set({ wsConnected: connected }),

    reset: () => set({
        activeRoomId: null, messages: {}, rooms: [],
        unreadCounts: {}, wsConnected: false,
    }),

    removeRoom: (roomId) => set((state) => {
        const { [roomId]: _, ...restMessages } = state.messages;
        const { [roomId]: __, ...restUnread } = state.unreadCounts;
        return {
            messages: restMessages,
            unreadCounts: restUnread,
            rooms: state.rooms.filter(r => r.id !== roomId),
            activeRoomId: state.activeRoomId === roomId ? null : state.activeRoomId,
        };
    }),
}));