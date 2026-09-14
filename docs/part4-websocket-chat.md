# Part 4：实时聊天 — WebSocket

---

## 4.1 消息协议设计

所有 WebSocket 消息使用 JSON 格式，通过 `type` 字段区分消息类型：

| type | 方向 | 说明 | 字段 |
|------|------|------|------|
| `join` | C→S | 加入房间 | `{type, room_id}` |
| `leave` | C→S | 离开房间 | `{type, room_id}` |
| `message` | C→S | 发送消息 | `{type, room_id, content, message_type, reply_to_id?}` |
| `ping` | C→S | 心跳 | `{type}` |
| `history` | C→S | 请求历史消息 | `{type, room_id, before_id?, limit}` |
| `new_message` | S→C | 新消息推送 | `{type, message: ChatMessage}` |
| `system` | S→C | 系统消息 | `{type, room_id, content, timestamp}` |
| `pong` | S→C | 心跳响应 | `{type, timestamp}` |
| `history_response` | S→C | 历史消息 | `{type, room_id, messages: [], has_more}` |
| `error` | S→C | 错误响应 | `{type, code, message}` |
| `online_status` | S→C | 在线状态变更 | `{type, room_id, user_id, online}` |
| `room_deleted` | S→C | 房间被删除 | `{type, room_id, timestamp}` |

---

## 4.2 添加 WebSocket 依赖

在 `backend/pom.xml` 的 `<dependencies>` 中追加：

```xml
<!-- ===== Part 4 新增依赖 ===== -->

<!-- [Spring WebSocket] WebSocket 支持，包含 STOMP 和原生 WebSocket -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
```

---

## 4.3 聊天数据持久化 → 建聊天三张表

聊天记录和房间信息需要落库，至此才创建聊天相关的表和实体（版本号延续 Part 2/3 的迁移序列）。

### 4.3.1 建表：聊天室 / 聊天消息 / 用户-房间关系

> **说明**：在 `backend/src/main/resources/db/migration/` 下新建三个迁移文件，重启应用后 Flyway 自动执行。

```sql
-- backend/src/main/resources/db/migration/V004__create_chat_rooms.sql
CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    room_type VARCHAR(20) NOT NULL DEFAULT 'group'
        CHECK (room_type IN ('group', 'direct')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_chat_rooms_type ON chat_rooms(room_type);
CREATE INDEX idx_chat_rooms_active ON chat_rooms(is_active) WHERE is_active = TRUE;

CREATE TRIGGER trigger_chat_rooms_updated_at
    BEFORE UPDATE ON chat_rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

```sql
-- backend/src/main/resources/db/migration/V005__create_chat_messages.sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text'
        CHECK (message_type IN ('text', 'image', 'file', 'system')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL
);

CREATE INDEX idx_chat_messages_room_created ON chat_messages(room_id, created_at DESC);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
```

```sql
-- backend/src/main/resources/db/migration/V006__create_user_rooms.sql
CREATE TABLE IF NOT EXISTS user_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    role VARCHAR(20) DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member')),
    CONSTRAINT uq_user_room UNIQUE(user_id, room_id)
);

CREATE INDEX idx_user_rooms_user ON user_rooms(user_id);
CREATE INDEX idx_user_rooms_room ON user_rooms(room_id);
```

### 4.3.2 ChatRoom 与 ChatMessage 实体

```java
// backend/src/main/java/com/blog/model/ChatRoom.java
package com.blog.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_rooms")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChatRoom {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(columnDefinition = "TEXT")
    @Builder.Default
    private String description = "";

    @Column(name = "room_type", nullable = false, length = 20)
    @Builder.Default
    private String roomType = "group";

    @Column(name = "created_by")
    @JsonProperty("created_by")
    private UUID createdBy;

    @Column(name = "avatar_url", columnDefinition = "TEXT")
    private String avatarUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
```

```java
// backend/src/main/java/com/blog/model/ChatMessage.java
package com.blog.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_messages")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Column(name = "sender_id", nullable = false)
    private UUID senderId;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "message_type", length = 20)
    @Builder.Default
    private String messageType = "text";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "is_edited")
    @Builder.Default
    private Boolean isEdited = false;

    @Column(name = "reply_to_id")
    private UUID replyToId;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
```

### 4.3.3 聊天 Repository

```java
// backend/src/main/java/com/blog/repository/ChatRoomRepository.java
package com.blog.repository;

import com.blog.model.ChatRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ChatRoomRepository extends JpaRepository<ChatRoom, UUID> {
    List<ChatRoom> findByIsActiveTrue();
}
```

```java
// backend/src/main/java/com/blog/repository/ChatMessageRepository.java
package com.blog.repository;

import com.blog.model.ChatMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

    Page<ChatMessage> findByRoomIdOrderByCreatedAtDesc(UUID roomId, Pageable pageable);

    Page<ChatMessage> findByRoomIdAndCreatedAtBeforeOrderByCreatedAtDesc(
            UUID roomId, java.time.Instant before, Pageable pageable);
}
```

### 4.3.4 增量修改 SecurityConfig：放行 WebSocket 端点

WebSocket 握手走 HTTP 升级请求，会被 Spring Security 拦截。
回到 `SecurityConfig.java` 的 `requestMatchers(...)` 白名单追加一条：

```java
                ).permitAll()
                // [Part 4] WebSocket 端点（握手后由 WebSocketAuthInterceptor 验证 JWT）
                .requestMatchers("/ws/**").permitAll()
```

### 4.3.5 Redis 数据结构设计总览

至此 Redis 的使用场景已全部展开（Part 2 的黑名单 + 本章的在线状态/房间成员），统一汇总如下：

| Key 模式 | 数据类型 | 用途 | TTL |
|----------|----------|------|-----|
| `session:{token}` | String | JWT 黑名单（登出后失效，Part 2） | 与 JWT 剩余有效期一致 |
| `online:users` | Set | 当前在线用户 ID 集合 | 无（心跳维护） |
| `user:last_seen:{user_id}` | String | 用户最后活跃时间 | 5 分钟 |
| `room:members:{room_id}` | Set | 房间当前在线成员 | 无（连接维护） |
| `unread:{user_id}` | Hash | 用户各房间未读消息数 | 无（读取后清零） |
| `chat:latest:{room_id}` | String | 房间最新消息 JSON | 1 小时 |
| `pubsub:room:{room_id}` | Pub/Sub | 房间消息广播频道 | 无 |
| `rate:{ip}:{endpoint}` | String + TTL | 接口限流计数器（Part 6） | 根据策略设定 |
| `cache:post:{post_id}` | String | 文章详情缓存 | 10 分钟 |

#### Redis 操作参考

> **说明**：以下是 Redis 命令，在容器内的 `redis-cli` 交互终端中执行：
>
> ```powershell
> docker exec -it blog-redis redis-cli -a redispass123
> ```

```
# [Redis] Set — 在线状态管理
SADD online:users "user-uuid-1"
SREM online:users "user-uuid-1"
SMEMBERS online:users
SCARD online:users

# [Redis] Set — 房间在线成员
SADD room:members:room-uuid-1 "user-uuid-1"
SREM room:members:room-uuid-1 "user-uuid-1"
SMEMBERS room:members:room-uuid-1

# [Redis] Hash — 未读消息计数
HINCRBY unread:user-uuid-1 room-uuid-1 1
HGETALL unread:user-uuid-1
HDEL unread:user-uuid-1 room-uuid-1

# [Redis] String + TTL — 用户最后活跃时间
SET user:last_seen:user-uuid-1 "2024-01-01T12:00:00Z" EX 300

# [Redis] String — 文章缓存
SET cache:post:post-uuid-1 '{"title":"..."}' EX 600
GET cache:post:post-uuid-1
DEL cache:post:post-uuid-1

# [Redis] Pub/Sub — 多实例消息同步
PUBLISH pubsub:room:room-uuid-1 '{"type":"message","content":"hello"}'
SUBSCRIBE pubsub:room:room-uuid-1

# [Redis] String + TTL — 滑动窗口限流（Part 6）
INCR rate:192.168.1.1:/api/posts
EXPIRE rate:192.168.1.1:/api/posts 60
```

---

## 4.4 消息协议 DTO

```java
// backend/src/main/java/com/blog/websocket/ChatMessageDto.java
// [WebSocket] 聊天消息 DTO — 客户端发送的消息结构
package com.blog.websocket;

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
```

```java
// backend/src/main/java/com/blog/websocket/ServerMessage.java
// [WebSocket] 服务端消息构建工具
package com.blog.websocket;

import java.time.Instant;
import java.util.*;

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

    public static Map<String, Object> historyResponse(String roomId,
            List<Map<String, Object>> messages, boolean hasMore) {
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
```

---

## 4.5 ChatService

```java
// backend/src/main/java/com/blog/service/ChatService.java
package com.blog.service;

import com.blog.model.ChatMessage;
import com.blog.repository.ChatMessageRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class ChatService {

    private final ChatMessageRepository messageRepository;

    public ChatService(ChatMessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }

    @Transactional
    public ChatMessage saveMessage(String roomId, String senderId,
                                   String content, String messageType, String replyToId) {
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
            // 查找 beforeId 对应消息的时间戳
            var beforeMsg = messageRepository.findById(UUID.fromString(beforeId));
            if (beforeMsg.isPresent()) {
                page = messageRepository
                        .findByRoomIdAndCreatedAtBeforeOrderByCreatedAtDesc(
                                roomUUID, beforeMsg.get().getCreatedAt(),
                                PageRequest.of(0, limit));
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
```

---

## 4.6 连接管理器

```java
// backend/src/main/java/com/blog/websocket/ConnectionManager.java
// [WebSocket] 连接管理 — 维护用户与 WebSocket 会话的映射关系
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

    // userId → WebSocketSession
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    // roomId → Set<userId>
    private final Map<String, Set<String>> roomMembers = new ConcurrentHashMap<>();

    private final StringRedisTemplate redisTemplate;

    public ConnectionManager(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void addSession(String userId, WebSocketSession session) {
        sessions.put(userId, session);
        // [Redis] 记录在线状态
        redisTemplate.opsForSet().add("online:users", userId);
    }

    public void removeSession(String userId, WebSocketSession closingSession) {
        // 只有当关闭的 session 仍是当前映射的 session 时才执行清理
        // 防止页面刷新时旧 session 的 close 事件晚于新 session 的 open，误删新连接
        WebSocketSession current = sessions.get(userId);
        if (current != closingSession) {
            log.debug("Stale session close ignored for user={} (new session already active)", userId);
            return;
        }
        sessions.remove(userId);
        redisTemplate.opsForSet().remove("online:users", userId);
        // 从所有房间移除
        roomMembers.values().forEach(members -> members.remove(userId));
    }

    public void joinRoom(String roomId, String userId) {
        roomMembers.computeIfAbsent(roomId, k -> ConcurrentHashMap.newKeySet()).add(userId);
        // [Redis] 记录房间在线成员
        redisTemplate.opsForSet().add("room:members:" + roomId, userId);
    }

    public void leaveRoom(String roomId, String userId) {
        Set<String> members = roomMembers.get(roomId);
        if (members != null) {
            members.remove(userId);
            if (members.isEmpty()) roomMembers.remove(roomId);
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
```

---

## 4.7 ChatWebSocketHandler

```java
// backend/src/main/java/com/blog/websocket/ChatWebSocketHandler.java
// [Spring WebSocket] 聊天处理器 — 处理所有 WebSocket 消息
package com.blog.websocket;

import com.blog.model.ChatMessage;
import com.blog.service.ChatService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;

@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);

    private final ConnectionManager connectionManager;
    private final ChatService chatService;
    private final ObjectMapper objectMapper;

    public ChatWebSocketHandler(ConnectionManager connectionManager,
                                ChatService chatService,
                                ObjectMapper objectMapper) {
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

    @Override
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
        // 广播在线状态
        String statusMsg = toJson(ServerMessage.onlineStatus(roomId, userId, true));
        connectionManager.broadcastToRoom(roomId, statusMsg, null);
        // 发送系统消息
        String sysMsg = toJson(ServerMessage.system(roomId, "User joined"));
        connectionManager.broadcastToRoom(roomId, sysMsg, null);
    }

    private void handleLeave(String userId, String roomId) {
        connectionManager.leaveRoom(roomId, userId);
        String statusMsg = toJson(ServerMessage.onlineStatus(roomId, userId, false));
        connectionManager.broadcastToRoom(roomId, statusMsg, null);
    }

    private void handleMessage(String userId, ChatMessageDto dto) {
        // [Service] 保存消息到数据库
        ChatMessage saved = chatService.saveMessage(dto.getRoomId(), userId,
                dto.getContent(), dto.getMessageType(), dto.getReplyToId());

        // 构建推送消息
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
        var messages = chatService.getHistory(dto.getRoomId(),
                dto.getBeforeId(), dto.getLimit() != null ? dto.getLimit() : 50);
        String response = toJson(ServerMessage.historyResponse(
                dto.getRoomId(), messages, messages.size() >= 50));
        connectionManager.sendToUser(userId, response);
    }

    private void sendError(String userId, String code, String message) {
        connectionManager.sendToUser(userId, toJson(ServerMessage.error(code, message)));
    }

    private String getUserId(WebSocketSession session) {
        return (String) session.getAttributes().get("userId");
    }

    private String getUsername(WebSocketSession session) {
        return (String) session.getAttributes().get("username");
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return "{}";
        }
    }
}
```

---

## 4.8 WebSocket 认证拦截器

```java
// backend/src/main/java/com/blog/websocket/WebSocketAuthInterceptor.java
// [WebSocket] 握手拦截器 — 从 URL 参数提取 JWT 进行认证
package com.blog.websocket;

import com.blog.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Component
public class WebSocketAuthInterceptor implements HandshakeInterceptor {

    private final JwtTokenProvider tokenProvider;

    public WebSocketAuthInterceptor(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes)
            throws Exception {
        // [WebSocket] 从 URL 参数 ?token=xxx 提取 JWT
        if (request instanceof ServletServerHttpRequest servletRequest) {
            String token = servletRequest.getServletRequest().getParameter("token");
            if (token != null && tokenProvider.isTokenValid(token)) {
                Claims claims = tokenProvider.validateToken(token);
                attributes.put("userId", claims.getSubject());
                attributes.put("username", claims.get("username", String.class));
                return true;
            }
        }
        return false;  // 认证失败，拒绝握手
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // 握手完成后无需额外操作
    }
}
```

---

## 4.9 WebSocket 配置

至此 Handler、拦截器都已实现，现在编写配置类将它们组装注册：

```java
// backend/src/main/java/com/blog/config/WebSocketConfig.java
// [Spring WebSocket] WebSocket 配置 — 注册 Handler 和拦截器
package com.blog.config;

import com.blog.websocket.ChatWebSocketHandler;
import com.blog.websocket.WebSocketAuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final ChatWebSocketHandler chatHandler;
    private final WebSocketAuthInterceptor authInterceptor;

    public WebSocketConfig(ChatWebSocketHandler chatHandler,
                           WebSocketAuthInterceptor authInterceptor) {
        this.chatHandler = chatHandler;
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(chatHandler, "/ws/chat")
                .addInterceptors(authInterceptor)
                .setAllowedOrigins("*");  // 生产环境应限制具体域名
    }
}
```

---

## 4.10 Redis Pub/Sub 多实例同步

> 当后端部署多个实例时，WebSocket 连接分散在不同实例上。
> 通过 Redis Pub/Sub 实现跨实例消息广播。

```java
// backend/src/main/java/com/blog/websocket/RedisPubSubManager.java
// [Redis Pub/Sub] 多实例消息同步 — 一个实例收到消息后通过 Redis 广播给其他实例
package com.blog.websocket;

import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

@Component
public class RedisPubSubManager implements MessageListener {

    private static final String CHAT_CHANNEL = "chat:broadcast";

    private final StringRedisTemplate redisTemplate;
    private final RedisMessageListenerContainer listenerContainer;
    private final ConnectionManager connectionManager;

    public RedisPubSubManager(StringRedisTemplate redisTemplate,
                              RedisMessageListenerContainer listenerContainer,
                              ConnectionManager connectionManager) {
        this.redisTemplate = redisTemplate;
        this.listenerContainer = listenerContainer;
        this.connectionManager = connectionManager;
    }

    @PostConstruct
    public void init() {
        // [Redis] 订阅广播频道
        listenerContainer.addMessageListener(this, new ChannelTopic(CHAT_CHANNEL));
    }

    public void publishMessage(String roomId, String jsonMessage) {
        // [Redis] 发布消息到频道，所有实例都会收到
        redisTemplate.convertAndSend(CHAT_CHANNEL, roomId + ":" + jsonMessage);
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String body = new String(message.getBody());
        int separator = body.indexOf(':');
        if (separator > 0) {
            String roomId = body.substring(0, separator);
            String jsonMessage = body.substring(separator + 1);
            // 广播给本实例上该房间的所有成员
            connectionManager.broadcastToRoom(roomId, jsonMessage, null);
        }
    }
}
```

---

## 4.11 聊天室 REST API

> **说明**：WebSocket 负责实时消息推送，但聊天室列表的获取/创建需要通过 REST API 完成。
> 本节补充聊天室的 CRUD 接口，供前端在加载聊天页面时获取可用房间列表。

### 4.11.1 ChatRoomService

```java
// backend/src/main/java/com/blog/service/ChatRoomService.java
// [REST API] 聊天室服务 — 提供房间查询和创建的业务逻辑
package com.blog.service;

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
    public ChatRoom getRoom(String roomId) {
        return chatRoomRepository.findById(UUID.fromString(roomId))
                .orElseThrow(() -> new RuntimeException("Chat room not found"));
    }
}
```

### 4.11.2 ChatRoomController

```java
// backend/src/main/java/com/blog/controller/ChatRoomController.java
// [REST API] 聊天室控制器 — 提供房间列表查询和创建接口
package com.blog.controller;

import com.blog.model.ChatRoom;
import com.blog.service.ChatRoomService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/chat-rooms")
public class ChatRoomController {

    private final ChatRoomService chatRoomService;

    public ChatRoomController(ChatRoomService chatRoomService) {
        this.chatRoomService = chatRoomService;
    }

    @GetMapping
    public ResponseEntity<List<ChatRoom>> getActiveRooms() {
        // [REST] GET /api/chat-rooms — 获取所有活跃房间
        return ResponseEntity.ok(chatRoomService.getActiveRooms());
    }

    @PostMapping
    public ResponseEntity<ChatRoom> createRoom(
            @RequestBody Map<String, String> body,
            Authentication auth) {
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
        return ResponseEntity.ok(chatRoomService.getRoom(roomId));
    }
}
```

### 4.11.3 SecurityConfig 增量修改：放行聊天室接口

聊天室列表需要登录后才能访问，因此**不需要**加入白名单。但创建房间接口需要认证，Spring Security 默认拦截所有未放行路径，所以无需额外配置。

> **注意**：如果前端在未登录状态下访问 `/api/chat-rooms`，会返回 401。这是预期行为。

### 4.11.4 默认聊天室种子数据

> **说明**：创建文件 `backend/src/main/resources/db/migration/V007__insert_default_chat_rooms.sql`。
> 应用重启后 Flyway 自动执行，向 `chat_rooms` 表插入三条默认房间记录。

```sql
-- backend/src/main/resources/db/migration/V007__insert_default_chat_rooms.sql
-- [Flyway] 种子数据 — 插入默认聊天室，确保用户首次进入聊天页面时有房间可选

INSERT INTO chat_rooms (id, name, description, room_type, is_active, created_at, updated_at)
VALUES 
    (gen_random_uuid(), 'General', 'General discussion room', 'group', true, NOW(), NOW()),
    (gen_random_uuid(), 'Tech Talk', 'Technology discussions', 'group', true, NOW(), NOW()),
    (gen_random_uuid(), 'Random', 'Random topics', 'group', true, NOW(), NOW());
```

> **验证**：重启应用后，通过以下 PowerShell 命令确认房间已创建：
>
> ```powershell
> # 先登录获取 token
> $loginResp = Invoke-RestMethod -Uri 'http://localhost:8080/api/auth/login' -Method POST -ContentType 'application/json' -Body '{"email":"alice@example.com","password":"Test1234!"}'
> $token = $loginResp.access_token
>
> # 查询聊天室列表
> Invoke-RestMethod -Uri 'http://localhost:8080/api/chat-rooms' -Headers @{Authorization="Bearer $token"}
> ```
>
> 预期返回包含 3 个房间的 JSON 数组。


### 4.11.5 删除房间接口（仅创建者可删除）

> **需求**：用户可以删除自己创建的聊天室，不能删除别人创建的房间。
> 采用软删除（将 `is_active` 置为 `false`），数据保留但不再出现在活跃列表中。

**增量修改 ChatRoomService** — 在 `getRoom(...)` 方法之后追加 `deleteRoom` 方法：

```java
// [增量修改] ChatRoomService.java — 追加删除房间方法

    @Transactional
    public void deleteRoom(String roomId, String currentUserId) {
        ChatRoom room = chatRoomRepository.findById(UUID.fromString(roomId))
                .orElseThrow(() -> new BusinessException(404, "Chat room not found"));

        // [权限校验] 只有创建者才能删除
        if (!currentUserId.equals(room.getCreatedBy().toString())) {
            throw new BusinessException(403, "Only the room creator can delete this room");
        }

        // [软删除] 置为不活跃，数据保留
        room.setIsActive(false);
        chatRoomRepository.save(room);
    }
```

> **注意**：`BusinessException` 已在 `com.blog.exception` 包中（Part 3 文章功能已创建），此处直接复用。

**增量修改 ChatRoomController** — 在 `getRoom(...)` 方法之后追加 `deleteRoom` 端点：

```java
// [增量修改] ChatRoomController.java — 追加删除房间端点

    @DeleteMapping("/{roomId}")
    public ResponseEntity<Void> deleteRoom(
            @PathVariable String roomId,
            Authentication auth) {
        // [REST] DELETE /api/chat-rooms/{id} — 删除房间（仅创建者可操作）
        UUID userId = UUID.fromString((String) auth.getPrincipal());
        chatRoomService.deleteRoom(roomId, userId.toString());

        // [WebSocket] 通知房间内所有在线用户：房间已删除
        Set<String> members = connectionManager.getRoomMembers(roomId);
        String msg = toJson(ServerMessage.roomDeleted(roomId));
        for (String m : members) {
            connectionManager.sendToUser(m, msg);
        }
        // 清理内存中的房间成员
        members.forEach(m -> connectionManager.leaveRoom(roomId, m));

        return ResponseEntity.noContent().build();
    }
```

> 需要在类中注入 `ConnectionManager` 和 `ObjectMapper`（用于 `toJson`），并在文件顶部追加 import：
>
> ```java
> import com.blog.websocket.ConnectionManager;
> import com.blog.websocket.ServerMessage;
> import java.util.Set;
> ```
>
> 构造函数同步修改：
>
> ```java
> private final ChatRoomService chatRoomService;
> private final ConnectionManager connectionManager;
> private final ObjectMapper objectMapper;
>
> public ChatRoomController(ChatRoomService chatRoomService,
>                           ConnectionManager connectionManager,
>                           ObjectMapper objectMapper) {
>     this.chatRoomService = chatRoomService;
>     this.connectionManager = connectionManager;
>     this.objectMapper = objectMapper;
> }
>
> private String toJson(Object obj) {
>     try {
>         return objectMapper.writeValueAsString(obj);
>     } catch (Exception e) {
>         return "{}";
>     }
> }
> ```

> **验证**：
>
> ```powershell
> # 登录获取 token
> $loginResp = Invoke-RestMethod -Uri 'http://localhost:8080/api/auth/login' -Method POST -ContentType 'application/json' -Body '{"email":"alice@example.com","password":"Test1234!"}'
> $token = $loginResp.access_token
>
> # 创建一个新房间
> $newRoom = Invoke-RestMethod -Uri 'http://localhost:8080/api/chat-rooms' -Method POST -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body '{"name":"Test Room","description":"A test room"}'
> $newRoomId = $newRoom.id
>
> # 删除自己创建的房间（应返回 204）
> Invoke-RestMethod -Uri "http://localhost:8080/api/chat-rooms/$newRoomId" -Method DELETE -Headers @{Authorization="Bearer $token"}
>
> # 用另一个用户登录后尝试删除别人的房间（应返回 403）
> ```
>
> **WebSocket 通知验证**：
>
> 1. 用户 A 和用户 B 同时进入同一个聊天室（两人均在线）
> 2. 用户 A 点击删除按钮删除该房间
> 3. 用户 B 的界面应自动收到 `room_deleted` 事件：
>    - 该房间从侧边栏列表消失
>    - 如果用户 B 正在看该房间，自动跳转到 `/chat` 首页
>    - 输入框被禁用，无法继续发送消息