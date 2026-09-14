# Part 5：前端实现

> 后端接口在 Part 2-4 已就绪，本章才开始前端开发。
> 前端项目的初始化（脚手架、依赖、构建配置）也放在这里——真正要写前端时才创建。

---

## 5.1 前端项目初始化

### 5.1.1 创建 Vite + React + TypeScript 项目

```powershell
# [Vite] 下一代前端构建工具，基于原生 ES Module 的极速开发服务器
cd java-blog
pnpm create vite@latest frontend --template react-ts
# 注意：新版 create-vite（7.x+）会出现交互式提问：
# "Which linter to use?" 选择 ESLint
# "Install with pnpm and start now?" 选 No 即可
cd frontend

# 安装核心依赖
pnpm add react@19 react-dom@19
pnpm add react-router-dom@7
pnpm add @tanstack/react-query@5
pnpm add zustand
pnpm add axios
pnpm add marked
pnpm add dompurify

# 开发依赖
pnpm add -D tailwindcss@4 @tailwindcss/vite@4 typescript@5
pnpm add -D vitest
pnpm add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
pnpm add -D @types/react @types/react-dom
pnpm add -D @tailwindcss/typography
```

### 5.1.2 Vite 配置

> **说明**：用下方内容**整体覆盖**脚手架生成的 `frontend/vite.config.ts`。
> 其中 `/api` 与 `/ws` 代理指向 Part 2-4 已完成的后端服务。

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),        // React JSX 转换 + Fast Refresh
    tailwindcss(),  // TailwindCSS 4 原子类编译
  ],
  server: {
    port: 5173,     // 开发服务器端口
    proxy: {
      '/api': {
        target: 'http://localhost:8080',  // Spring Boot 后端地址
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
})
```

### 5.1.3 TypeScript 配置

> **说明**：在 `tsconfig.app.json` 和 `tsconfig.node.json` 的 Linting 块中各补一行 `"strict": true`。

Vite React 模板采用三文件 tsconfig 结构，无需额外修改。

### 5.1.4 TailwindCSS 4 主题配置

> **说明**：用下方内容**整体覆盖**脚手架生成的 `frontend/src/index.css`。
>
> **注意**：`@theme` 块内**只能**放 `--自定义属性` 和 `@keyframes`；普通 CSS 规则（如下方的 typography 覆盖）
> 必须写在 `@theme` 结束花括号**外面的顶层**，误放进块内会报
> `@theme blocks must only contain custom properties or @keyframes`。

```css
/* frontend/src/index.css */
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;

  --color-primary-50: #eff6ff;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;

  --font-family-sans: 'Inter', system-ui, sans-serif;
  --font-family-mono: 'JetBrains Mono', monospace;
}

/* [@tailwindcss/typography] 插件默认通过 code::before/::after 给行内代码
   两侧加装饰反引号，观感上像“反引号没被渲染掉”，这里去除
  （pre 内的代码块插件自身已排除，不受影响）
   ⚠ 必须写在 @theme 外面的顶层，放进 @theme 块内会编译报错 */
.prose code::before,
.prose code::after {
  content: none;
}
```

---

## 5.2 路由设计

```tsx
// frontend/src/App.tsx
// [React Router v7] SPA 路由配置 — 嵌套路由 + 数据 loader
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// [TanStack Query] QueryClientProvider 提供全局缓存上下文
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queries';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PostListPage } from './pages/PostListPage';
import { HomePage } from './pages/HomePage';
import { PostDetailPage } from './pages/PostDetailPage';
import { PostEditorPage } from './pages/PostEditorPage';
import { ChatPage } from './pages/ChatPage';
import { UserProfilePage } from './pages/UserProfilePage';

export default function App() {
  return (
    // [TanStack Query] 全局 Provider — 所有子组件共享缓存
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* [React Router v7] 嵌套路由 — Layout 作为父路由包裹所有子页面 */}
          <Route element={<Layout />}>
            {/* 公开路由 */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            {/* [改动] Home 页面显示当前用户自己的文章（不限状态） */}
            <Route path="/" element={<HomePage />} />
            {/* [改动] Posts 页面显示所有 published 文章 */}
            <Route path="/posts" element={<PostListPage />} />
            <Route path="/posts/:id" element={<PostDetailPage />} />
            <Route path="/users/:id" element={<UserProfilePage />} />

            {/* [React Router v7] 受保护路由 — 需要登录 */}
            <Route element={<ProtectedRoute />}>
              <Route path="/posts/new" element={<PostEditorPage />} />
              <Route path="/posts/:id/edit" element={<PostEditorPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:roomId" element={<ChatPage />} />
            </Route>
          </Route>

          {/* 兜底路由 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

---

## 5.3 API 类型定义

```tsx
// frontend/src/api/types.ts
// [TypeScript] API 响应类型 — 前后端共享的类型契约

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  status: string;
  created_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  content?: string;
  content_html?: string;
  summary: string;
  cover_image: string;
  tags: string[];
  status: string;
  view_count: number;
  like_count: number;
  created_at: string;
  published_at: string;
  updated_at?: string;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  parent_id: string;
  is_deleted: boolean;
  created_at: string;
  replies?: Comment[];
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string;
  content: string;
  message_type: string;
  is_edited: boolean;
  reply_to_id: string;
  created_at: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
  room_type: string;
  created_by: string | null;   // 创建者 ID，用于判断当前用户是否有权删除
  avatar_url: string;
  member_count: number;
  last_message: string;
  is_active: boolean;
  created_at: string;
}

// [TypeScript] 分页响应泛型
export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface ApiError {
  error: string;
}
```

---

## 5.4 Axios 实例封装

```tsx
// frontend/src/api/axios.ts
// [Axios] HTTP 客户端封装 — 拦截器自动注入 JWT、处理 401 刷新
import axios from 'axios';
import type { AxiosError } from 'axios';
import { useAuthStore } from '../stores/authStore';

// [Axios] 创建实例 — 统一 baseURL 和超时
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// [Axios] 请求拦截器 — 自动注入 JWT Bearer Token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      // [Axios] 在请求头添加 Authorization — 后端 JwtAuthFilter 验证
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// [Axios] 响应拦截器 — 统一错误处理 + 401 Token 刷新
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    const status = error.response?.status;
    // 后端对「token 过期/无效」返回 403（Spring Security 默认入口点），而非 401，
    // 因此 401 与 403 都视为认证失败
    const isAuthError = status === 401 || status === 403;

    // [Axios] 登录/注册自身返回的 401 是业务错误（密码错、邮箱不存在等），
    // 必须原样 reject 交给页面展示提示：若进入下方刷新分支，会在没有
    // refreshToken 时走 logout + window.location.href='/login' 整页重载，
    // LoginPage 重新挂载、error 状态被清空，用户看到的就是“毫无提示”
    const isAuthSubmit = originalRequest?.url?.includes('/auth/login')
      || originalRequest?.url?.includes('/auth/register');
    if (isAuthError && isAuthSubmit) {
      return Promise.reject(error);
    }

    // [Axios] refresh 请求自身失败（refresh token 过期）→ 立即登出
    // 必须放在最前面：否则 refresh 的 401 会再次进入下方刷新分支，造成无限递归
    if (originalRequest?.url?.includes('/auth/refresh')) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // [Axios] 401/403 认证失败 — 尝试用 Refresh Token 刷新
    if (isAuthError && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(error);
        }

        // [Axios] 用 refresh_token 换取新 access_token
        // 后端 AuthResponse 通过 @JsonProperty 输出 snake_case
        const { data } = await api.post('/auth/refresh', {
          refresh_token: refreshToken,
        });

        // 防御性检查：确保 refresh 响应包含有效 token
        if (!data?.access_token || !data?.refresh_token) {
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(new Error('Invalid refresh response'));
        }

        // 更新 Store 中的 Token（与后端 @JsonProperty 输出的 snake_case 一致）
        useAuthStore.getState().setTokens(data.access_token, data.refresh_token);

        // [Axios] 用新 Token 重试原始请求
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        // 刷新失败 — 强制登出
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // [Axios] 重试后仍 401/403 — 强制登出
    if (isAuthError && originalRequest._retry) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
```

---

## 5.5 React Query 请求层

```tsx
// frontend/src/api/queries.ts
// [TanStack Query v5] 服务端状态管理 — 自动缓存/重试/失效
import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import api from './axios';
import type { Post, Comment, PaginatedResponse, AuthResponse, User, ChatRoom } from './types';

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

// [新增] 当前用户的所有文章查询 — Home 页面使用（不限状态）
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
```

---

## 5.6 Zustand Store

### 5.6.1 Auth Store

```tsx
// frontend/src/stores/authStore.ts
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
```

### 5.6.2 Chat Store

```tsx
// frontend/src/stores/chatStore.ts
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
  removeRoom: (roomId: string) => void;
  reset: () => void;
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

  removeRoom: (roomId) => set((state) => {
    const { [roomId]: _msg, ...restMessages } = state.messages;
    const { [roomId]: _unread, ...restUnread } = state.unreadCounts;
    return {
      messages: restMessages,
      unreadCounts: restUnread,
      rooms: state.rooms.filter(r => r.id !== roomId),
      activeRoomId: state.activeRoomId === roomId ? null : state.activeRoomId,
    };
  }),

  reset: () => set({
    activeRoomId: null, messages: {}, rooms: [],
    unreadCounts: {}, wsConnected: false,
  }),
}));
```

### 5.6.3 UI Store

```tsx
// frontend/src/stores/uiStore.ts
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
```

---

## 5.7 WebSocket 客户端 Hook

```tsx
// frontend/src/hooks/useWebSocket.ts
// [WebSocket] 客户端封装 — 连接管理、自动重连、心跳、消息分发
import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage } from '../api/types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws/chat';
const HEARTBEAT_INTERVAL = 30000;  // 30 秒心跳
const MAX_RECONNECT_DELAY = 30000; // 最大重连间隔 30 秒

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualClose = useRef(false);  // 防止主动关闭时触发重连

  const { accessToken, isAuthenticated } = useAuthStore();
  const { addMessage, setWsConnected, incrementUnread, activeRoomId } = useChatStore();

  // [WebSocket] 发送消息
  const sendMessage = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // [WebSocket] 加入房间
  const joinRoom = useCallback((roomId: string) => {
    sendMessage({ type: 'join', room_id: roomId });
  }, [sendMessage]);

  // [WebSocket] 离开房间
  const leaveRoom = useCallback((roomId: string) => {
    sendMessage({ type: 'leave', room_id: roomId });
  }, [sendMessage]);

  // [WebSocket] 发送聊天消息
  const sendChatMessage = useCallback((roomId: string, content: string, messageType = 'text') => {
    sendMessage({ type: 'message', room_id: roomId, content, message_type: messageType });
  }, [sendMessage]);

  // [WebSocket] 请求历史消息
  const requestHistory = useCallback((roomId: string, beforeId?: string, limit = 50) => {
    sendMessage({ type: 'history', room_id: roomId, before_id: beforeId, limit });
  }, [sendMessage]);

  // [WebSocket] 启动心跳
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, HEARTBEAT_INTERVAL);
  }, [sendMessage]);

  // [WebSocket] 指数退避重连
  const scheduleReconnect = useCallback(() => {
    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttempt.current),
      MAX_RECONNECT_DELAY
    );
    reconnectAttempt.current++;
    reconnectTimer.current = setTimeout(() => {
      connect();
    }, delay);
  }, []);

  // [WebSocket] 处理服务端消息
  const handleServerMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'new_message':
          // [WebSocket] 新消息 — 添加到对应房间的消息列表
          addMessage(data.message.room_id, data.message as ChatMessage);
          // 如果不是当前活跃房间，增加未读计数
          if (data.message.room_id !== activeRoomId) {
            incrementUnread(data.message.room_id);
          }
          break;

        case 'system':
          // 系统消息（加入/离开通知）
          addMessage(data.room_id, {
            id: `sys-${Date.now()}`,
            room_id: data.room_id,
            sender_id: 'system',
            sender_name: 'System',
            sender_avatar: '',
            content: data.content,
            message_type: 'system',
            is_edited: false,
            reply_to_id: '',
            created_at: data.timestamp,
          });
          break;

        case 'history_response':
          // 历史消息 — 前置插入到消息列表
          useChatStore.getState().prependMessages(data.room_id, data.messages);
          break;

        case 'pong':
          // 心跳响应 — 连接正常
          break;

        case 'online_status':
          // 在线状态变更
          break;

        case 'error':
          console.error('WebSocket error:', data.message);
          break;

        case 'room_deleted':
          // 房间被删除 — 清理本地状态，如果正在看该房间则跳转到聊天首页
          useChatStore.getState().removeRoom(data.room_id);
          if (useChatStore.getState().activeRoomId === data.room_id) {
            window.location.href = '/chat';
          }
          break;
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  }, [addMessage, incrementUnread, activeRoomId]);

  // [WebSocket] 建立连接
  const connect = useCallback(() => {
    if (!isAuthenticated || !accessToken) return;

    // 关闭旧连接（标记为手动关闭，避免 onclose 触发重连）
    if (wsRef.current) {
      isManualClose.current = true;
      wsRef.current.close();
      // 注意：不要在这里重置 isManualClose，等 onclose 处理完再重置
    }

    const url = `${WS_URL}?token=${accessToken}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setWsConnected(true);
      reconnectAttempt.current = 0;
      startHeartbeat();
    };

    ws.onmessage = handleServerMessage;

    ws.onclose = () => {
      setWsConnected(false);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      // 读取并重置标志（必须在重置前读取）
      const wasManual = isManualClose.current;
      isManualClose.current = false;
      // [WebSocket] 仅非主动关闭时才自动重连
      if (!wasManual) {
        scheduleReconnect();
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };

    wsRef.current = ws;
  }, [isAuthenticated, accessToken]);

  // [WebSocket] 生命周期管理 — 登录时连接，登出时断开
  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }

    return () => {
      if (wsRef.current) {
        isManualClose.current = true;  // 防止 cleanup 关闭时触发 onclose → 状态闪烁
        wsRef.current.close();
        wsRef.current = null;
      }
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [isAuthenticated]);

  return {
    sendMessage,
    joinRoom,
    leaveRoom,
    sendChatMessage,
    requestHistory,
    isConnected: useChatStore((s) => s.wsConnected),
  };
}
```

---

## 5.8 页面组件

### 5.8.1 Layout 布局

```tsx
// frontend/src/components/Layout.tsx
// [TailwindCSS] 响应式布局 — 导航栏 + 侧边栏 + 主内容区
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { useUIStore } from '../stores/uiStore';

export function Layout() {
  const { sidebarOpen } = useUIStore();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* [TailwindCSS] 固定顶部导航栏 */}
      <Navbar />

      <div className="flex pt-16">
        {/* [TailwindCSS] 响应式侧边栏 — lg 以上显示，以下隐藏 */}
        <aside className={`
          ${sidebarOpen ? 'block' : 'hidden'}
          lg:block w-64 shrink-0
          fixed lg:sticky top-16 h-[calc(100vh-4rem)]
          bg-white dark:bg-gray-800
          border-r border-gray-200 dark:border-gray-700
          overflow-y-auto z-30
        `}>
          <nav className="p-4 space-y-2">
            <a href="/" className="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              Home
            </a>
            <a href="/posts" className="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              Posts
            </a>
            <a href="/chat" className="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              Chat
            </a>
          </nav>
        </aside>

        {/* [TailwindCSS] 主内容区 — 自适应宽度 */}
        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

### 5.8.2 Navbar

```tsx
// frontend/src/components/Navbar.tsx
// [TailwindCSS] 顶部导航栏 — Logo + 搜索 + 用户菜单
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useState } from 'react';

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/posts?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-40">
      <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between">
        {/* 左侧：汉堡菜单 + Logo */}
        <div className="flex items-center gap-4">
          <button onClick={toggleSidebar} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/" className="text-xl font-bold text-primary-600">
            Blog Platform
          </Link>
        </div>

        {/* 中间：搜索框 */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md mx-8">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts..."
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </form>

        {/* 右侧：用户菜单 */}
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <Link to="/posts/new" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                New Post
              </Link>
              <Link to="/chat" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </Link>
              <span className="text-sm text-gray-600 dark:text-gray-300">{user?.username}</span>
              <button onClick={() => { logout(); navigate('/login'); }}
                className="text-sm text-red-600 hover:text-red-700">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">Login</Link>
              <Link to="/register" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

### 5.8.3 ProtectedRoute

```tsx
// frontend/src/components/ProtectedRoute.tsx
// [React Router v7] 路由守卫 — 未登录重定向到登录页
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

### 5.8.4 LoginPage

```tsx
// frontend/src/pages/LoginPage.tsx
// [React 19] 函数式组件 + Hooks — 登录页面
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '../api/queries';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const { setAuth } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const data = await loginMutation.mutateAsync({ email, password });
      // [Zustand] 更新认证状态
      setAuth(data.user, data.access_token, data.refresh_token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-8">Sign In</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500" />
          </div>
          <button type="submit" disabled={loginMutation.isPending}
            className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Don't have an account? <Link to="/register" className="text-primary-600 hover:underline">Register</Link>
        </p>
      </div>
    </div>
  );
}
```

### 5.8.5 RegisterPage

```tsx
// frontend/src/pages/RegisterPage.tsx
// [React 19] 注册页面 — 表单 + useRegister mutation
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '../api/queries';

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const registerMutation = useRegister();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await registerMutation.mutateAsync({ username, email, password });
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-8">Create Account</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500" />
          </div>
          <button type="submit" disabled={registerMutation.isPending}
            className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {registerMutation.isPending ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account? <Link to="/login" className="text-primary-600 hover:underline">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
```

### 5.8.6 UserProfilePage

```tsx
// frontend/src/pages/UserProfilePage.tsx
// [React Router] useParams 取 URL 用户 ID + TanStack Query 缓存
import { useParams } from 'react-router-dom';
import { useUser } from '../api/queries';

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, error } = useUser(id!);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <p className="text-gray-500">User not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        {/* [TailwindCSS] 头像 + 基本信息 */}
        <div className="flex items-center gap-6 mb-6">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.display_name || user.username}
              className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-2xl font-bold text-primary-600">
              {(user.display_name || user.username).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{user.display_name || user.username}</h1>
            <p className="text-gray-500 dark:text-gray-400">@{user.username}</p>
          </div>
        </div>

        {/* 个人简介 */}
        {user.bio && (
          <p className="mb-4 text-gray-700 dark:text-gray-300">{user.bio}</p>
        )}

        {/* 注册时间 */}
        <p className="text-sm text-gray-400">
          Joined {new Date(user.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
```

### 5.8.7 PostListPage

```tsx
// frontend/src/pages/PostListPage.tsx
// [TanStack Query] 文章列表 — 自动缓存、分页、搜索
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePosts, useSearchPosts } from '../api/queries';
import { PostCard } from '../components/PostCard';

export function PostListPage() {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('search') || '';
  const [page, setPage] = useState(1);

  // [TanStack Query] 根据是否有搜索词选择不同查询
  const postsQuery = usePosts('published', page);
  const searchResult = useSearchPosts(searchQuery, page);
  const data = searchQuery ? searchResult.data : postsQuery.data;
  const isLoading = searchQuery ? searchResult.isLoading : postsQuery.isLoading;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">
          {searchQuery ? `Search: "${searchQuery}"` : 'Latest Posts'}
        </h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : data?.items?.length === 0 ? (
        <p className="text-center text-gray-500 py-20">No posts found.</p>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {data?.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          {/* [TailwindCSS] 分页控件 */}
          <div className="flex justify-center gap-2 mt-8">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-4 py-2 rounded-lg border hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
              Previous
            </button>
            <span className="px-4 py-2">Page {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={!data || data.items.length < 20}
              className="px-4 py-2 rounded-lg border hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

### 5.8.8 PostCard

> **改动**：日期显示优先使用 `updated_at`（fallback 到 `published_at`），非 published 文章显示状态标签。

```tsx
// frontend/src/components/PostCard.tsx
import { Link } from 'react-router-dom';
import type { Post } from '../api/types';

export function PostCard({ post }: { post: Post }) {
  return (
    <Link to={`/posts/${post.id}`}
      className="block bg-white dark:bg-gray-800 rounded-xl shadow hover:shadow-lg transition-shadow overflow-hidden">
      {post.cover_image && (
        <img src={post.cover_image} alt={post.title} className="w-full h-48 object-cover" />
      )}
      <div className="p-5">
        {/* [TailwindCSS] 标签列表 */}
        <div className="flex flex-wrap gap-2 mb-2">
          {post.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-xs bg-primary-50 text-primary-600 rounded-full">
              {tag}
            </span>
          ))}
        </div>
        <h2 className="text-lg font-semibold mb-2 line-clamp-2">{post.title}</h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-3">{post.summary}</p>
        <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
          {/* [改动] 日期优先显示 updated_at，fallback 到 published_at */}
          <span>{new Date(post.updated_at || post.published_at).toLocaleDateString()}</span>
          <div className="flex gap-3">
            {/* [新增] 非 published 文章显示状态标签 */}
            {post.status !== 'published' && (
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                post.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
              }`}>
                {post.status}
              </span>
            )}
            <span>{post.view_count} views</span>
            <span>{post.like_count} likes</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
```

### 5.8.9 HomePage

> **新增页面**：Home 页面显示当前登录用户自己的所有文章（不限状态），未登录时引导登录。

```tsx
// frontend/src/pages/HomePage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyPosts } from '../api/queries';
import { useAuthStore } from '../stores/authStore';
import { PostCard } from '../components/PostCard';

export function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  // 未登录时引导去登录
  if (!isAuthenticated) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold mb-4">Welcome to Blog Platform</h1>
        <p className="text-gray-500 mb-8">Login to see your posts.</p>
        <button onClick={() => navigate('/login')}
                className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          Login
        </button>
      </div>
    );
  }

  const { data, isLoading } = useMyPosts(page);

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Posts</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : data?.items?.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">No posts yet.</p>
          <button onClick={() => navigate('/posts/new')}
                  className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            Create Your First Post
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {data?.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          <div className="flex justify-center gap-2 mt-8">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-4 py-2 rounded-lg border hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
              Previous
            </button>
            <span className="px-4 py-2">Page {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={!data || data.items.length < 20}
                    className="px-4 py-2 rounded-lg border hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

### 5.8.10 PostDetailPage

```tsx
// frontend/src/pages/PostDetailPage.tsx
// [Marked + DOMPurify] Markdown 渲染 + XSS 防护
import { useParams, useNavigate } from 'react-router-dom';
import { usePost, useLikePost } from '../api/queries';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { CommentSection } from '../components/CommentSection';
import { useAuthStore } from '../stores/authStore';

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: post, isLoading, error } = usePost(id!);
  const likePost = useLikePost();
  const { user, isAuthenticated } = useAuthStore();

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
    </div>
  );
  if (error || !post) return <div className="text-center py-20 text-red-500">Post not found</div>;

  // 仅文章作者可见编辑按钮
  const isAuthor = isAuthenticated && user?.id === post.author_id;

  return (
    // [排版] max-w-6xl 加宽正文列；px-4 保证小屏不贴边
    <article className="max-w-6xl mx-auto px-4">
      <header className="mb-8">
        {/* [排版] 标题独自一行：占满容器宽度，不与按钮同行被挤压换行 */}
        <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
        {/* [排版] 元信息行：日期/浏览/点赞/tags 在左，操作按钮经 ml-auto 右对齐同行 */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span>{new Date(post.published_at || post.created_at).toLocaleDateString()}</span>
          <span>{post.view_count} views</span>
          {/* [点赞] 点击调用 useLikePost，后端 like_count 自增后刷新缓存 */}
          <button
            onClick={() => likePost.mutate(post.id)}
            disabled={likePost.isPending || !isAuthenticated}
            className="flex items-center gap-1 hover:text-primary-600 disabled:opacity-50"
          >
            ♥ {post.like_count}
          </button>
          <div className="flex gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs">{tag}</span>
            ))}
          </div>
          {/* [排版] 操作按钮组：ml-auto 推到行尾右对齐（Part 7 的 AI Summary 按钮也加进此组） */}
          <div className="ml-auto flex items-center gap-2">
            {isAuthor && (
              <button
                onClick={() => navigate(`/posts/${post.id}/edit`)}
                className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </header>

      {/* [Marked + DOMPurify] 安全渲染 Markdown 内容 */}
      <MarkdownRenderer content={post.content_html || post.content || ''} />

      {/* 评论区 */}
      <div className="mt-12 border-t border-gray-200 dark:border-gray-700 pt-8">
        <CommentSection postId={post.id} />
      </div>
    </article>
  );
}
```

### 5.8.10 MarkdownRenderer

```tsx
// frontend/src/components/MarkdownRenderer.tsx
// [Marked] Markdown 解析器 + [DOMPurify] XSS 防护
import { useMemo } from 'react';
// [Marked] 将 Markdown 文本解析为 HTML
import { marked } from 'marked';
// [DOMPurify] 清洗 HTML — 移除 script 标签等危险内容，防止 XSS
import DOMPurify from 'dompurify';

// [Marked] 配置 Markdown 解析选项
marked.setOptions({
  breaks: true,     // 换行符转为 <br>
  gfm: true,        // 启用 GitHub Flavored Markdown
});

interface Props {
  content: string;
}

export function MarkdownRenderer({ content }: Props) {
  // [React] useMemo — 缓存渲染结果，避免重复解析
  const html = useMemo(() => {
    // [Marked] 解析 Markdown 为 HTML 字符串
    const rawHtml = marked.parse(content) as string;
    // [DOMPurify] 清洗 HTML — 只允许安全标签和属性通过
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li',
        'a','img','strong','em','code','pre','blockquote','table','thead',
        'tbody','tr','th','td','del','sup','sub','span','div'],
      ALLOWED_ATTR: ['href','src','alt','title','class','target','width','height'],
    });
  }, [content]);

  // [TailwindCSS] prose 类提供排版样式（需 @tailwindcss/typography 插件）
  return (
    <div
      className="prose prose-lg dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

### 5.8.11 ChatPage

```tsx
// frontend/src/pages/ChatPage.tsx
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
```

### 5.8.12 ChatMessage 组件

```tsx
// frontend/src/components/ChatMessage.tsx
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
```

### 5.8.13 ChatRoomList

```tsx
// frontend/src/components/ChatRoomList.tsx
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
```

### 5.8.14 CommentSection

```tsx
// frontend/src/components/CommentSection.tsx
import { useState } from 'react';
import { useComments, useCreateComment } from '../api/queries';
import { useAuthStore } from '../stores/authStore';

export function CommentSection({ postId }: { postId: string }) {
  const { data: comments, isLoading } = useComments(postId);
  const createComment = useCreateComment();
  const [content, setContent] = useState('');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    await createComment.mutateAsync({ postId, content: content.trim() });
    setContent('');
  };

  return (
    <div>
      <h3 className="text-xl font-bold mb-4">Comments</h3>

      {isAuthenticated && (
        <form onSubmit={handleSubmit} className="mb-6">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write a comment..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500"
          />
          <button type="submit" disabled={createComment.isPending}
            className="mt-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {createComment.isPending ? 'Posting...' : 'Post Comment'}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-gray-500">Loading comments...</p>
      ) : comments?.length === 0 ? (
        <p className="text-gray-500">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {comments?.map((comment) => (
            <div key={comment.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-sm">{comment.is_deleted ? '[Deleted]' : comment.content}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(comment.created_at).toLocaleString()}
              </p>
              {comment.replies?.map((reply) => (
                <div key={reply.id} className="ml-6 mt-2 p-3 bg-white dark:bg-gray-700 rounded-lg">
                  <p className="text-sm">{reply.is_deleted ? '[Deleted]' : reply.content}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(reply.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 5.8.15 PostEditorPage

```tsx
// frontend/src/pages/PostEditorPage.tsx
// [React] Markdown 编辑器 — 编辑 + 实时预览
import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreatePost, useUpdatePost, usePost } from '../api/queries';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

export function PostEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { data: existingPost } = usePost(id!);

  const [title, setTitle] = useState(existingPost?.title || '');
  const [content, setContent] = useState(existingPost?.content || '');
  const [tags, setTags] = useState(existingPost?.tags.join(', ') || '');
  const [status, setStatus] = useState(existingPost?.status || 'draft');

  const createPost = useCreatePost();
  const updatePost = useUpdatePost();

  // [UX] 双栏同步滚动：按"已滚比例"映射到另一栏；
  // syncingRef 防止程序设置 scrollTop 触发对方 onScroll 造成死循环
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const handleScroll = (source: 'editor' | 'preview') => {
    if (syncingRef.current) return;
    const from = source === 'editor' ? editorRef.current : previewRef.current;
    const to = source === 'editor' ? previewRef.current : editorRef.current;
    if (!from || !to) return;
    const fromMax = from.scrollHeight - from.clientHeight;
    if (fromMax <= 0) return;
    syncingRef.current = true;
    to.scrollTop = (from.scrollTop / fromMax) * (to.scrollHeight - to.clientHeight);
    requestAnimationFrame(() => { syncingRef.current = false; });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const postData = {
      title, content,
      tags: tags.split(/[,，;；]/).map(t => t.trim()).filter(Boolean),
      status,
    };

    if (isEditing && id) {
      await updatePost.mutateAsync({ id, ...postData });
    } else {
      await createPost.mutateAsync(postData);
    }
    navigate('/posts');
  };

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{isEditing ? 'Edit Post' : 'New Post'}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title" required
          className="w-full px-4 py-3 text-xl border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" />

        <input type="text" value={tags} onChange={(e) => setTags(e.target.value)}
          placeholder="Tags (comma separated)"
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" />

        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>

        {/* [TailwindCSS] 双栏布局 — 编辑 + 预览；
            两栏固定为"视口剩余高度"（28rem ≈ 本页双栏上下的总开销），
            内容超出时栏内滚动，不再撑长整页；textarea 禁用手动 resize 保持两栏等高 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Markdown</label>
            <textarea ref={editorRef} onScroll={() => handleScroll('editor')}
              value={content} onChange={(e) => setContent(e.target.value)}
              className="w-full h-[calc(100vh-28rem)] min-h-[400px] resize-none px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm bg-white dark:bg-gray-700" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Preview</label>
            <div ref={previewRef} onScroll={() => handleScroll('preview')}
              className="h-[calc(100vh-28rem)] min-h-[400px] p-4 border border-gray-200 dark:border-gray-600 rounded-lg overflow-y-auto bg-white dark:bg-gray-800">
              <MarkdownRenderer content={content} />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button type="submit" disabled={createPost.isPending || updatePost.isPending}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {isEditing ? 'Update' : 'Create'}
          </button>
          <button type="button" onClick={() => navigate(-1)}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## 5.9 入口文件配置

> **说明**：`frontend/src/index.css` 已在 5.1.4 节配置完成，包含 TailwindCSS 导入和自定义主题色。
> 此处不要重新覆盖该文件，否则 5.1.4 节定义的 `--color-primary-*` 等主题变量会丢失。
> 以下仅需创建 `main.tsx` 和 `index.html`（若尚未创建）。

```tsx
// frontend/src/main.tsx
// [React 19] 应用入口 — 挂载根组件
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```html
<!-- frontend/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Blog Platform</title>
</head>
<body class="antialiased">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

---

## 5.10 启动与前后端联调

> **前置条件**：Part 1-4 的后端服务已可正常启动（PostgreSQL、Redis 容器运行中）。

### 5.10.1 启动后端

在 `java-blog/backend/` 目录下启动 Spring Boot（二选一）：

```powershell
# 方式一：Maven 命令
mvn spring-boot:run

# 方式二：IDEA 右键 Application.java → Run
```

确认控制台出现 `Started Application in x.xx seconds`，后端监听 `http://localhost:8080`。

### 5.10.2 启动前端

新开一个终端，在 `java-blog/frontend/` 目录下：

```powershell
pnpm dev
```

Vite 输出类似：

```
  VITE v8.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

浏览器打开 `http://localhost:5173`。

### 5.10.3 联调验证

Vite 代理已在 5.1.2 节配置：前端 `/api/*` 请求自动转发到后端 `http://localhost:8080/api/*`，`/ws/*` WebSocket 请求同理。

**验证步骤**：

1. **注册**：点击页面右上角 "Register"，填写用户名/邮箱/密码，提交后应跳转到登录页
2. **登录**：输入刚注册的邮箱和密码，登录成功后跳转到首页
3. **浏览文章**：首页应显示文章列表（如果后端数据库中已有数据）
4. **WebSocket 聊天**：进入聊天页面，应能看到默认聊天室列表（General、Tech Talk、Random）
5. **加入聊天室**：点击任意聊天室，应能进入聊天界面并发送消息
6. **实时推送**：打开第二个浏览器窗口登录另一账号，发送消息后第一个窗口应实时收到

### 5.10.4 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 前端页面空白，控制台报 `401 Unauthorized` | 后端 Security 未放行对应接口 | 检查 `SecurityConfig` 白名单是否包含该路径 |
| 注册/登录请求报 `Network Error` | 后端未启动或端口不对 | 确认后端 `8080` 端口正常监听 |
| 页面样式没有加载 | TailwindCSS 未编译 | 确认 `index.css` 包含 `@import "tailwindcss"` |
| 正文行内代码两侧仍包着反引号 | `@tailwindcss/typography` 的 `code::before/::after` 装饰反引号（marked 解析本身正常） | 5.1.4 的 `index.css` 已用 `.prose code::before/::after { content: none }` 覆盖 |
| Vite 报 `@theme blocks must only contain custom properties or @keyframes` | 普通 CSS 规则误写进 `@theme` 块内 | `@theme` 只接受 `--自定义属性` 和 `@keyframes`，把规则移到块外顶层（见 5.1.4） |
| 登录失败无任何提示，页面像“闪了一下” | axios 拦截器把登录的 401 当 token 过期，走 logout + `window.location.href='/login'` 整页重载，吞掉错误提示 | 5.4 拦截器已用 `isAuthSubmit` 跳过 `/auth/login`、`/auth/register`，错误原样交给页面展示 |
| WebSocket 连接失败 | ws 代理未生效 | 确认 `vite.config.ts` 中 `/ws` 代理配置 `ws: true` |
| 刷新页面后 404 | SPA 路由需要 fallback | Vite 开发模式已自动处理；生产部署需 Nginx `try_files` |
