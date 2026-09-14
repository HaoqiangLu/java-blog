package com.blog.controller;

import com.blog.model.ChatRoom;
import com.blog.service.ChatRoomService;
import com.blog.websocket.ConnectionManager;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/chat-rooms")
public class ChatRoomController {

    private final ChatRoomService chatRoomService;

    private final ConnectionManager connectionManager;

    public ChatRoomController(ChatRoomService chatRoomService, ConnectionManager connectionManager) {
        this.chatRoomService = chatRoomService;
        this.connectionManager = connectionManager;
    }

    @GetMapping
    public ResponseEntity<List<ChatRoom>> getActiveRooms() {
        // [REST] GET /api/chat-rooms — 获取所有活跃房间
        return ResponseEntity.ok(chatRoomService.getActiveRooms());
    }

    @PostMapping
    public ResponseEntity<ChatRoom> createRoom(
            @RequestBody Map<String, String> body,
            Authentication auth
    ) {
        // [REST] POST /api/chat-rooms — 创建新房间
        UUID userId = UUID.fromString((String) auth.getPrincipal());
        ChatRoom room = chatRoomService.createRoom(
                body.get("name"),
                body.get("description"),
                userId
        );
        return ResponseEntity.ok(room);
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<ChatRoom> getRoom(@PathVariable String roomId) {
        // [REST] GET /api/chat-rooms/{id} — 获取单个房间详情
        return ResponseEntity.ok(chatRoomService.getRoom(UUID.fromString(roomId)));
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<Void> deleteRoom(
            @PathVariable String roomId,
            Authentication auth
    ) {
        // [REST] DELETE /api/chat-rooms/{id} — 删除房间（仅创建者可操作）
        UUID userId = UUID.fromString((String) auth.getPrincipal());
        chatRoomService.deleteRoom(UUID.fromString(roomId), userId);

        // 通知房间内所有在线用户：房间已删除
        Set<String> members = connectionManager.getRoomMembers(roomId);
        String msg = "{\"type\":\"room_deleted\",\"room_id\":\"" + roomId + "\"}";
        for (String m : members) {
            connectionManager.sendToUser(m, msg);
        }
        // 清理内存中的房间成员
        members.forEach(m -> connectionManager.leaveRoom(roomId, m));

        return ResponseEntity.noContent().build();
    }
}
