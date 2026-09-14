package com.blog.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ConnectionManager {

    private static final Logger log = LoggerFactory.getLogger(ConnectionManager.class);

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    private final Map<String, Set<String>> roomMembers = new ConcurrentHashMap<>();

    private final StringRedisTemplate redisTemplate;

    public ConnectionManager(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void addSession(String userId, WebSocketSession session) {
        sessions.put(userId, session);
        redisTemplate.opsForSet().add("online:users", userId);
    }

    public void removeSession(String userId, WebSocketSession closingSession) {
        WebSocketSession current = sessions.get(userId);
        if (current != closingSession) {
            log.debug("Stale session close ignored for user={} (new session already active)", userId);
            return;
        }
        sessions.remove(userId);
        redisTemplate.opsForSet().remove("online:users", userId);
        roomMembers.values().forEach(members -> members.remove(userId));
    }

    public void joinRoom(String roomId, String userId) {
        roomMembers.computeIfAbsent(roomId, k -> ConcurrentHashMap.newKeySet()).add(userId);
        redisTemplate.opsForSet().add("room:members:" + roomId, userId);
    }

    public void leaveRoom(String roomId, String userId) {
        Set<String> members = roomMembers.get(roomId);
        if (members != null) {
            members.remove(userId);
            if (members.isEmpty()) {
                roomMembers.remove(roomId);
            }
        }
        redisTemplate.opsForSet().remove("room:members:" + roomId, userId);
    }

    public Set<String> getRoomMembers(String roomId) {
        return roomMembers.getOrDefault(roomId, Set.of());
    }

    public boolean isOnline(String userId) {
        return sessions.containsKey(userId);
    }

    public void sendToUser(String userId, String message) {
        WebSocketSession session = sessions.get(userId);
        if (session != null && session.isOpen()) {
            try {
                session.sendMessage(new TextMessage(message));
            } catch (IOException e) {
                log.warn("WebSocket send failed for user={}: {}", userId, e.getMessage());
            }
        }
    }

    public void broadcastToRoom(String roomId, String message, String excludeUserId) {
        Set<String> members = getRoomMembers(roomId);
        for (String userId : members) {
            if (!userId.equals(excludeUserId)) {
                sendToUser(userId, message);
            }
        }
    }
}
