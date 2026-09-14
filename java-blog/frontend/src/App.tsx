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
import { AiChatPage } from './pages/AiChatPage';

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
              {/* Home 页面显示当前用户自己的文章（不限状态） */}
              <Route path="/" element={<HomePage />} />
              {/* Posts 页面显示所有 published 文章 */}
              <Route path="/posts" element={<PostListPage />} />
              <Route path="/posts/:id" element={<PostDetailPage />} />
              <Route path="/users/:id" element={<UserProfilePage />} />

              {/* [React Router v7] 受保护路由 — 需要登录 */}
              <Route element={<ProtectedRoute />}>
                <Route path="/posts/new" element={<PostEditorPage />} />
                <Route path="/posts/:id/edit" element={<PostEditorPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/chat/:roomId" element={<ChatPage />} />
                <Route path="/ai-chat" element={<AiChatPage />} />
              </Route>
            </Route>

            {/* 兜底路由 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
  );
}