package com.blog.websocket;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ChatMessageDto {
    private String type;        // join, leave, message, ping, history
    @JsonProperty("room_id")
    private String roomId;
    private String content;
    @JsonProperty("message_type")
    private String messageType; // text, image, file
    @JsonProperty("reply_to_id")
    private String replyToId;
    @JsonProperty("before_id")
    private String beforeId;
    private Integer limit;
}
