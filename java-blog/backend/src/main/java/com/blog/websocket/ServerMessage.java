package com.blog.websocket;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ServerMessage {

    public static Map<String, Object> newMessage(String type) {
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("type", type);
        return msg;
    }

    public static Map<String, Object> pong() {
        Map<String, Object> msg = newMessage("pong");
        msg.put("timestamp", Instant.now().toString());
        return msg;
    }

    public static Map<String, Object> system(String roomId, String content) {
        Map<String, Object> msg = newMessage("system");
        msg.put("room_id", roomId);
        msg.put("content", content);
        msg.put("timestamp", Instant.now().toString());
        return msg;
    }

    public static Map<String, Object> error(String code, String message) {
        Map<String, Object> msg = newMessage("error");
        msg.put("code", code);
        msg.put("message", message);
        return msg;
    }

    public static Map<String, Object> onlineStatus(String roomId, String userId, boolean online) {
        Map<String, Object> msg = newMessage("online_status");
        msg.put("room_id", roomId);
        msg.put("user_id", userId);
        msg.put("online", online);
        return msg;
    }

    public static Map<String, Object> historyResponse(String roomId, List<Map<String, Object>> messages, boolean hasMore) {
        Map<String, Object> msg = newMessage("history_response");
        msg.put("room_id", roomId);
        msg.put("messages", messages);
        msg.put("has_more", hasMore);
        return msg;
    }

    public static Map<String, Object> roomDeleted(String roomId) {
        Map<String, Object> msg = newMessage("room_deleted");
        msg.put("room_id", roomId);
        msg.put("timestamp", Instant.now().toString());
        return msg;
    }
}
