package com.blog.websocket;

import com.blog.model.ChatMessage;
import com.blog.service.ChatService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;

@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);

    private final ConnectionManager connectionManager;

    private final ChatService chatService;

    private final ObjectMapper objectMapper;

    public ChatWebSocketHandler(ConnectionManager connectionManager, ChatService chatService, ObjectMapper objectMapper) {
        this.connectionManager = connectionManager;
        this.chatService = chatService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String userId = getUserId(session);
        String username = getUsername(session);
        connectionManager.addSession(userId, session);
        log.info("WebSocket connected: user={} ({})", username, userId);
    }

    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String userId = getUserId(session);
        try {
            ChatMessageDto dto = objectMapper.readValue(message.getPayload(), ChatMessageDto.class);

            switch (dto.getType()) {
                case "join" -> handleJoin(userId, dto.getRoomId());
                case "leave" -> handleLeave(userId, dto.getRoomId());
                case "message" -> handleMessage(userId, dto);
                case "ping" -> handlePing(userId);
                case "history" -> handleHistory(userId, dto);
                default -> sendError(userId, "UNKNOWN_TYPE", "Unknown message type");
            }
        } catch (Exception e) {
            log.error("WebSocket message error: {}", e.getMessage());
            sendError(userId, "PARSE_ERROR", "Failed to parse message");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String userId = getUserId(session);
        connectionManager.removeSession(userId, session);
        log.info("WebSocket disconnected: user={}", userId);
    }

    private void handleJoin(String userId, String roomId) {
        connectionManager.joinRoom(roomId, userId);
        String statusMsg = toJson(ServerMessage.onlineStatus(roomId, userId, true));
        connectionManager.broadcastToRoom(roomId, statusMsg, null);
        String sysMsg = toJson(ServerMessage.system(roomId, "User joined"));
        connectionManager.broadcastToRoom(roomId, sysMsg, null);
    }

    private void handleLeave(String userId, String roomId) {
        connectionManager.leaveRoom(roomId, userId);
        String statusMsg = toJson(ServerMessage.onlineStatus(roomId, userId, false));
        connectionManager.broadcastToRoom(roomId, statusMsg, null);
    }

    private void handleMessage(String userId, ChatMessageDto dto) {
        ChatMessage saved = chatService.saveMessage(dto.getRoomId(), userId,
                dto.getContent(), dto.getMessageType(), dto.getReplyToId());

        Map<String, Object> msg = ServerMessage.newMessage("new_message");
        msg.put("message", chatService.toMessageMap(saved));

        String json = toJson(msg);
        // 广播给房间内所有成员（包括发送者，前端依赖 WebSocket 回显来展示消息）
        connectionManager.broadcastToRoom(dto.getRoomId(), json, null);
    }

    private void handlePing(String userId) {
        connectionManager.sendToUser(userId, toJson(ServerMessage.pong()));
    }

    private void handleHistory(String userId, ChatMessageDto dto) {
        var messages = chatService.getHistory(dto.getRoomId(), dto.getBeforeId(),
                dto.getLimit() != null ? dto.getLimit() : 50);
        String response = toJson(ServerMessage.historyResponse(dto.getRoomId(), messages, messages.size() >= 50));
        connectionManager.sendToUser(userId, response);
    }

    private void sendError(String userId, String code, String message) {
        connectionManager.sendToUser(userId, toJson(ServerMessage.error(code, message)));
    }

    private String getUserId(WebSocketSession session) {
        return session.getAttributes().get("userId").toString();
    }

    private String getUsername(WebSocketSession session) {
        return session.getAttributes().get("username").toString();
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return "{}";
        }
    }
}
