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