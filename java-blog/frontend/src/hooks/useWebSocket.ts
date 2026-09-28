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

                case 'room_deleted': {
                    const deletedRoomId = data.room_id;
                    // 从 store 中移除该房间的消息和未读计数
                    useChatStore.getState().removeRoom(deletedRoomId);
                    // 如果当前正在看这个房间，跳转到聊天首页
                    if (useChatStore.getState().activeRoomId === deletedRoomId) {
                        window.location.href = '/chat';
                    }
                    break;
                }
            }
        } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
        }
    }, [addMessage, incrementUnread, activeRoomId]);

    // [WebSocket] 建立连接
    const connect = useCallback(() => {
        if (!isAuthenticated || !accessToken) return;

        // [WebSocket] Token 过期检查 — 避免用过期 token 无限重连
        try {
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            if (payload.exp * 1000 < Date.now()) {
                console.warn('WebSocket: Access token expired, skipping connect');
                return;
            }
        } catch (e) {
            console.warn('WebSocket: Failed to parse token, skipping connect');
            return;
        }

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
            // [WebSocket] 重连后自动重新 join 当前房间，确保后端 roomMembers 指向新 session
            if (activeRoomId) {
                joinRoom(activeRoomId);
            }
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

    // [WebSocket] 生命周期管理 — 登录时连接，登出时断开，token 刷新时重连
    useEffect(() => {
        if (isAuthenticated && accessToken) {
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
    }, [isAuthenticated, accessToken]);

    return {
        sendMessage,
        joinRoom,
        leaveRoom,
        sendChatMessage,
        requestHistory,
        isConnected: useChatStore((s) => s.wsConnected),
    };
}