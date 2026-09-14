// [TanStack Query v5] 服务端状态管理 — 自动缓存/重试/失效
import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import api from './axios';
import type {Post, Comment, PaginatedResponse, AuthResponse, User, ChatRoom} from './types';
import type { AiProvidersResponse, AiChatResponse, AiSummaryResponse } from './types';

// [TanStack Query] 全局 QueryClient 配置
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // [TanStack Query] 窗口聚焦时不自动重新请求
            refetchOnWindowFocus: false,
            // [TanStack Query] 失败重试 3 次
            retry: 3,
            // [TanStack Query] 数据 5 分钟后视为过期
            staleTime: 5 * 60 * 1000,
            // [TanStack Query] 垃圾回收 10 分钟
            gcTime: 10 * 60 * 1000,
        },
    },
});

// ---- Auth Queries ----

// [TanStack Query] 登录 mutation — 无缓存，直接执行
export function useLogin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data: { email: string; password: string }) => {
            const resp = await api.post<AuthResponse>('/auth/login', data);
            return resp.data;
        },
        // [TanStack Query] 登录成功后清除用户相关缓存
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['posts'] });
        },
    });
}

export function useRegister() {
    return useMutation({
        mutationFn: async (data: { username: string; email: string; password: string }) => {
            const resp = await api.post('/auth/register', data);
            return resp.data;
        },
    });
}

// ---- User Queries ----

// [TanStack Query] 用户详情查询
export function useUser(id: string) {
    return useQuery({
        queryKey: ['users', id],
        queryFn: async () => {
            const resp = await api.get<User>(`/users/${id}`);
            return resp.data;
        },
        enabled: !!id,
    });
}

// ---- Post Queries ----

// [TanStack Query] 文章列表查询 — 自动缓存和分页（Posts 页面使用，仅 published）
export function usePosts(status: string = 'published', page: number = 1, pageSize: number = 20) {
    return useQuery({
        // [TanStack Query] queryKey — 唯一标识缓存，参数变化自动重新请求
        queryKey: ['posts', status, page, pageSize],
        queryFn: async () => {
            const resp = await api.get<PaginatedResponse<Post>>('/posts', {
                params: { status, page, page_size: pageSize },
            });
            return resp.data;
        },
    });
}

// 当前用户的所有文章查询 — Home 页面使用（不限状态）
export function useMyPosts(page: number = 1, pageSize: number = 20) {
    return useQuery({
        queryKey: ['my-posts', page, pageSize],
        queryFn: async () => {
            const resp = await api.get<PaginatedResponse<Post>>('/posts/my-posts', {
                params: { page, page_size: pageSize },
            });
            return resp.data;
        },
    });
}

// [TanStack Query] 文章详情查询
export function usePost(id: string) {
    return useQuery({
        queryKey: ['posts', id],
        queryFn: async () => {
            const resp = await api.get<Post>(`/posts/${id}`);
            return resp.data;
        },
        // [TanStack Query] 文章不存在时不重试
        retry: (failureCount, error: any) => {
            if (error?.response?.status === 404) return false;
            return failureCount < 3;
        },
    });
}

// [TanStack Query] 创建文章 mutation
export function useCreatePost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data: Partial<Post>) => {
            const resp = await api.post('/posts', data);
            return resp.data;
        },
        // [TanStack Query] 乐观更新 — 创建后立即刷新列表缓存
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['posts'] });
        },
    });
}

// [TanStack Query] 更新文章 mutation
export function useUpdatePost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: Partial<Post> & { id: string }) => {
            const resp = await api.put(`/posts/${id}`, data);
            return resp.data;
        },
        onSuccess: (_, variables) => {
            // [TanStack Query] 同时刷新列表和详情缓存
            qc.invalidateQueries({ queryKey: ['posts'] });
            qc.invalidateQueries({ queryKey: ['posts', variables.id] });
        },
    });
}

// [TanStack Query] 删除文章 mutation
export function useDeletePost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/posts/${id}`);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['posts'] });
        },
    });
}

// [TanStack Query] 点赞 mutation — 成功后刷新详情与列表缓存以更新 like_count
export function useLikePost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const resp = await api.post<Post>(`/posts/${id}/like`);
            return resp.data;
        },
        onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: ['posts', id] });
            qc.invalidateQueries({ queryKey: ['posts'] });
        },
    });
}

// ---- Comment Queries ----

export function useComments(postId: string) {
    return useQuery({
        queryKey: ['comments', postId],
        queryFn: async () => {
            const resp = await api.get<Comment[]>(`/posts/${postId}/comments`);
            return resp.data;
        },
        enabled: !!postId,  // postId 存在时才请求
    });
}

export function useCreateComment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ postId, content, parentId }: {
            postId: string; content: string; parentId?: string;
        }) => {
            const resp = await api.post(`/posts/${postId}/comments`, { content, parent_id: parentId });
            return resp.data;
        },
        // [TanStack Query] 评论创建后刷新评论列表
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: ['comments', variables.postId] });
        },
    });
}

// ---- Search Queries ----

export function useSearchPosts(query: string, page: number = 1) {
    return useQuery({
        queryKey: ['search', query, page],
        queryFn: async () => {
            const resp = await api.get<PaginatedResponse<Post>>('/search', {
                params: { q: query, page },
            });
            return resp.data;
        },
        // [TanStack Query] 搜索词为空时不请求
        enabled: query.length > 0,
    });
}

// ---- Chat Room Queries ----

// [TanStack Query] 聊天室列表查询 — 前端加载聊天页面时获取可用房间
export function useChatRooms() {
    return useQuery({
        queryKey: ['chatRooms'],
        queryFn: async () => {
            const resp = await api.get<ChatRoom[]>('/chat-rooms');
            return resp.data;
        },
    });
}

// [TanStack Query] 创建聊天室 mutation
export function useCreateChatRoom() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data: { name: string; description?: string }) => {
            const resp = await api.post<ChatRoom>('/chat-rooms', data);
            return resp.data;
        },
        // [TanStack Query] 创建成功后刷新房间列表
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['chatRooms'] });
        },
    });
}

// [TanStack Query] 删除聊天室 mutation — 仅创建者可操作
export function useDeleteChatRoom() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (roomId: string) => {
            await api.delete(`/chat-rooms/${roomId}`);
        },
        // [TanStack Query] 删除成功后刷新房间列表
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['chatRooms'] });
        },
    });
}

// ---- AI Queries ----

// [TanStack Query] 获取可用 AI Provider 列表
export function useAiProviders() {
    return useQuery({
        queryKey: ['ai-providers'],
        queryFn: async () => {
            const resp = await api.get<AiProvidersResponse>('/ai/providers');
            return resp.data;
        },
    });
}

// [TanStack Query] AI 聊天 mutation — 每次发送都是一次新请求
export function useAiChat() {
    return useMutation({
        mutationFn: async (data: { message: string; context?: string; provider?: string }) => {
            const resp = await api.post<AiChatResponse>('/ai/chat', data, { timeout: 120000 });
            return resp.data;
        },
    });
}

// [TanStack Query] AI 摘要 mutation
export function useAiSummary() {
    return useMutation({
        mutationFn: async (content: string) => {
            const resp = await api.post<AiSummaryResponse>('/ai/summarize', { content }, { timeout: 120000 });
            return resp.data;
        },
    });
}