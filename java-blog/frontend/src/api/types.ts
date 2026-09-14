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
    created_by: string | null;
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

// [AI] AI Provider 列表响应
export interface AiProvidersResponse {
    providers: string[];
}

// [AI] AI 聊天响应
export interface AiChatResponse {
    reply: string;
}

// [AI] AI 摘要响应
export interface AiSummaryResponse {
    summary: string;
}

// [AI] AI 聊天消息（前端本地状态）
export interface AiMessage {
    role: 'user' | 'assistant';
    content: string;
}