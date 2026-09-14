// [Zustand] 认证状态管理 — 用户信息、Token、登录/登出
import { create } from 'zustand';
// [Zustand] persist 中间件 — 状态持久化到 localStorage
import { persist } from 'zustand/middleware';
import type { User } from '../api/types';

interface AuthState {
    user: User | null;
    accessToken: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;

    // Actions
    setAuth: (user: User, accessToken: string, refreshToken: string) => void;
    setTokens: (accessToken: string, refreshToken: string) => void;
    setUser: (user: User) => void;
    logout: () => void;
}

// [Zustand] create 创建 Store — persist 中间件自动持久化到 localStorage
export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,

            setAuth: (user, accessToken, refreshToken) =>
                set({ user, accessToken, refreshToken, isAuthenticated: true }),

            setTokens: (accessToken, refreshToken) =>
                set({ accessToken, refreshToken }),

            setUser: (user) => set({ user }),

            logout: () =>
                set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
        }),
        {
            // [Zustand] localStorage key — 刷新页面后恢复登录状态
            name: 'blog-auth',
            // 只持久化 Token，不持久化完整用户对象（减少存储大小）
            partialize: (state) => ({
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);