// [Zustand] UI 状态管理 — 侧边栏、主题、模态框
import { create } from 'zustand';

interface UIState {
    sidebarOpen: boolean;
    chatSidebarOpen: boolean;
    theme: 'light' | 'dark';
    modalType: string | null;
    modalData: any;

    toggleSidebar: () => void;
    toggleChatSidebar: () => void;
    setTheme: (theme: 'light' | 'dark') => void;
    openModal: (type: string, data?: any) => void;
    closeModal: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
    sidebarOpen: true,
    chatSidebarOpen: true,
    theme: 'light',
    modalType: null,
    modalData: null,

    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    toggleChatSidebar: () => set((s) => ({ chatSidebarOpen: !s.chatSidebarOpen })),
    setTheme: (theme) => set({ theme }),
    openModal: (type, data) => set({ modalType: type, modalData: data }),
    closeModal: () => set({ modalType: null, modalData: null }),
}));