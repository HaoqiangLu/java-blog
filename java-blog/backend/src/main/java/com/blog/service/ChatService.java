package com.blog.service;

import com.blog.model.ChatMessage;
import com.blog.repository.ChatMessageRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class ChatService {

    private final ChatMessageRepository messageRepository;

    public ChatService(ChatMessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }

    @Transactional
    public ChatMessage saveMessage(
            String roomId, String senderId, String content,
            String messageType, String replyToId
    ) {
        ChatMessage message = ChatMessage.builder()
                .roomId(UUID.fromString(roomId))
                .senderId(UUID.fromString(senderId))
                .content(content)
                .messageType(messageType != null ? messageType : "text")
                .replyToId(replyToId != null ? UUID.fromString(replyToId) : null)
                .build();
        return messageRepository.save(message);
    }

    public List<Map<String, Object>> getHistory(String roomId, String beforeId, int limit) {
        UUID roomUUID = UUID.fromString(roomId);
        Page<ChatMessage> page;
        if (beforeId != null) {
            var beforeMsg = messageRepository.findById(UUID.fromString(beforeId));
            if (beforeMsg.isPresent()) {
                page = messageRepository
                        .findByRoomIdAndCreatedAtBeforeOrderByCreatedAtDesc(
                                roomUUID, beforeMsg.get().getCreatedAt(),
                                PageRequest.of(0, limit)
                        );
            } else {
                return List.of();
            }
        } else {
            page = messageRepository
                    .findByRoomIdOrderByCreatedAtDesc(roomUUID, PageRequest.of(0, limit));
        }

        return page.getContent().stream().map(this::toMessageMap).toList();
    }

    public Map<String, Object> toMessageMap(ChatMessage msg) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", msg.getId());
        map.put("room_id", msg.getRoomId());
        map.put("sender_id", msg.getSenderId());
        map.put("content", msg.getContent());
        map.put("message_type", msg.getMessageType());
        map.put("is_edited", msg.getIsEdited());
        map.put("reply_to_id", msg.getReplyToId());
        map.put("created_at", msg.getCreatedAt().toString());
        return map;
    }
}
