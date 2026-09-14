package com.blog.websocket;

import jakarta.annotation.PostConstruct;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;

@Component
public class RedisPubSubManager implements MessageListener {

    private static final String CHAT_CHANNEL = "chat:broadcast";

    private final StringRedisTemplate redisTemplate;

    private final RedisMessageListenerContainer listenerContainer;

    private final ConnectionManager connectionManager;

    public RedisPubSubManager(StringRedisTemplate redisTemplate,
                              RedisMessageListenerContainer listenerContainer,
                              ConnectionManager connectionManager
    ) {
        this.redisTemplate = redisTemplate;
        this.listenerContainer = listenerContainer;
        this.connectionManager = connectionManager;
    }

    @PostConstruct
    public void init() {
        listenerContainer.addMessageListener(this, new ChannelTopic(CHAT_CHANNEL));
    }

    public void publishMessage(String roomId, String jsonMessage) {
        redisTemplate.convertAndSend(CHAT_CHANNEL, roomId + ":" + jsonMessage);
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String body = new String(message.getBody());
        int separator = body.indexOf(':');
        if (separator > 0) {
            String roomId = body.substring(0, separator);
            String jsonMessage = body.substring(separator + 1);
            connectionManager.broadcastToRoom(roomId, jsonMessage, null);
        }
    }
}
