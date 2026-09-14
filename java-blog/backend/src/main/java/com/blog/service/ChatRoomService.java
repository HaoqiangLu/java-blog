package com.blog.service;

import com.blog.exception.BusinessException;
import com.blog.model.ChatRoom;
import com.blog.repository.ChatRoomRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class ChatRoomService {

    private final ChatRoomRepository chatRoomRepository;

    public ChatRoomService(ChatRoomRepository chatRoomRepository) {
        this.chatRoomRepository = chatRoomRepository;
    }

    @Transactional(readOnly = true)
    public List<ChatRoom> getActiveRooms() {
        // [JPA] 查询所有活跃房间
        return chatRoomRepository.findByIsActiveTrue();
    }

    @Transactional
    public ChatRoom createRoom(String name, String description, UUID createdBy) {
        ChatRoom room = ChatRoom.builder()
                .name(name)
                .description(description != null ? description : "")
                .createdBy(createdBy)
                .build();
        return chatRoomRepository.save(room);
    }

    @Transactional(readOnly = true)
    public ChatRoom getRoom(UUID roomId) {
        return chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
    }

    @Transactional
    public void deleteRoom(UUID roomId, UUID currentUserId) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new BusinessException(404, "Chat room not found"));

        // [权限校验] 只有创建者才能删除
        if (!currentUserId.equals(room.getCreatedBy())) {
            throw new BusinessException(403, "Only the room creator can delete this room");
        }

        // [软删除] 置为不活跃，数据保留
        room.setIsActive(false);
        chatRoomRepository.save(room);
    }
}
