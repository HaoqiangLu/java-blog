# 技术详解文档

---

## 1. Spring Boot

**分类**：后端 / Web 框架

**是什么**：Spring Boot 是基于 Spring 框架的快速开发框架，通过自动配置和内嵌服务器大幅简化 Spring 应用的初始搭建和开发。Spring Boot 3.x 要求 JDK 17+。

**解决什么问题**：传统 Spring 应用需要大量 XML 配置和手动依赖管理，开发效率低。Spring Boot 通过约定优于配置的理念，让开发者专注于业务逻辑。

**在本项目中的用途**：
- 核心 HTTP 服务器，处理所有 RESTful API 请求（Part 2/3 Controller 层）
- WebSocket 服务器，处理实时聊天连接（Part 4 ChatWebSocketHandler）
- Spring Data JPA 管理 PostgreSQL 数据库操作（Part 2-4 Repository 层）
- Spring Security 实现认证授权和 CORS（Part 2 SecurityConfig, JwtAuthenticationFilter）

**核心 API 示例**：
```java
// [Spring Boot] REST 控制器 — @RestController + @RequestMapping 定义路由
@RestController
@RequestMapping("/api/posts")
public class PostController {
    @GetMapping("/{id}")
    public ResponseEntity<Post> getPost(@PathVariable String id) {
        return ResponseEntity.ok(postService.getPost(id));
    }
}

// [Spring Boot] JPA 查询 — 方法名自动推导 SQL
public interface PostRepository extends JpaRepository<Post, String> {
    Page<Post> findByStatus(String status, Pageable pageable);
}

// [Spring Boot] WebSocket 处理器
public class ChatWebSocketHandler extends TextWebSocketHandler {
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // 处理 WebSocket 消息
    }
}
```

**与其他技术的关系**：Spring Boot 内嵌 Tomcat 处理 HTTP，使用 Jackson 处理 JSON，通过 Spring Data JPA（Hibernate）连接 PostgreSQL，Spring Data Redis（Lettuce）连接 Redis。

**常见坑**：
- `@Transactional` 默认只对 `RuntimeException` 回滚，检查型异常需显式指定
- JPA 的懒加载在事务外访问会抛 `LazyInitializationException`
- Spring Boot 3.x 迁移自 `javax.*` 到 `jakarta.*` 命名空间

---

## 2. Jackson

**分类**：后端 / 序列化库

**是什么**：Java 生态最流行的 JSON 处理库，Spring Boot 默认集成。支持 POJO 与 JSON 的双向转换，注解驱动配置。

**解决什么问题**：Java 标准库没有 JSON 支持，手动构建和解析 JSON 极其繁琐。

**在本项目中的用途**：
- 所有 API 请求/响应的 JSON 序列化（Part 2/3 Controller 层自动处理）
- WebSocket 消息的编解码（Part 4 ObjectMapper）
- Redis 值的 JSON 序列化（Part 2 RedisConfig）

**核心 API 示例**：
```java
// [Jackson] 自动序列化 — Spring MVC 自动将返回值转为 JSON
@GetMapping("/posts")
public List<Post> getPosts() {  // 自动序列化为 JSON 数组
    return postService.listPosts();
}

// [Jackson] ObjectMapper 手动使用
ObjectMapper mapper = new ObjectMapper();
String json = mapper.writeValueAsString(object);    // 对象 → JSON
Post post = mapper.readValue(json, Post.class);     // JSON → 对象

// [Jackson] 注解控制序列化行为
@JsonProperty("room_id")    // 字段重命名
@JsonIgnore                  // 忽略字段（如 passwordHash）
@JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")  // 日期格式
```

**常见坑**：
- 循环引用（双向关联）会导致栈溢出，需用 `@JsonIgnore` 或 `@JsonBackReference`
- 大对象序列化有性能开销，考虑使用 `@JsonView` 控制输出字段

---

## 3. SLF4J + Logback

**分类**：后端 / 日志框架

**是什么**：SLF4J 是 Java 日志门面（抽象接口），Logback 是其默认实现。Spring Boot 自动配置 Logback，支持控制台输出、文件滚动、异步写入。

**解决什么问题**：Java 有多种日志实现（Log4j、JUL、Logback），SLF4J 提供统一接口，切换实现无需改代码。

**在本项目中的用途**：
- 全局日志输出（通过 application.yml 配置日志级别和格式）
- 请求日志拦截器（Part 3 WebConfig RequestLogInterceptor）
- Service/Repository 层错误记录

**核心 API 示例**：
```java
// [SLF4J] 日志级别 — trace < debug < info < warn < error
private static final Logger log = LoggerFactory.getLogger(MyService.class);

log.info("Server started on port {}", 8080);
log.error("Database error: {}", e.getMessage());
log.debug("User {} logged in", userId);

// [SLF4J] 占位符语法 — 避免字符串拼接开销
log.info("Processing post {} by user {}", postId, userId);
```

**与其他技术的关系**：Spring Boot 自动配置 Logback，通过 application.yml 的 `logging` 节点控制行为。

**常见坑**：
- 不要用字符串拼接 `log.info("msg: " + value)`，用占位符 `log.info("msg: {}", value)`
- 生产环境日志级别设为 WARN 或 ERROR，避免过多 I/O

---

## 4. jjwt (io.jsonwebtoken)

**分类**：后端 / 认证库

**是什么**：Java 最流行的 JWT 库，支持创建、解析、验证 JWT。提供流式 API，支持 HS256、RS256 等算法。

**解决什么问题**：前后端分离架构中，HTTP 是无状态的，需要一种机制在每次请求中验证用户身份。

**在本项目中的用途**：
- 用户登录后签发 Access Token 和 Refresh Token（Part 2 JwtTokenProvider）
- JwtAuthenticationFilter 验证每个受保护请求的 Token
- Token 黑名单机制配合 Redis 实现登出

**核心 API 示例**：
```java
// [jjwt] 创建 JWT — 流式 Builder API（jjwt 0.12.x 新版 API）
String token = Jwts.builder()
    .subject(userId)
    .claim("username", username)
    .issuedAt(new Date())
    .expiration(new Date(System.currentTimeMillis() + 3600000))
    .signWith(key)
    .compact();

// [jjwt] 验证 JWT — 解析并检查签名和过期时间
Claims claims = Jwts.parser()
    .verifyWith(key)
    .build()
    .parseSignedClaims(token)
    .getPayload();
```

**与其他技术的关系**：Redis 存储 Token 黑名单，Spring Security BCrypt 验证密码后才签发 JWT。

**常见坑**：
- HS256 的 secret 必须至少 256 位（32 字节）
- JWT 一旦签发无法修改，只能等过期或加入黑名单
- 不要在 payload 中放敏感信息（JWT 只是 base64 编码，不是加密）

---

## 5. Spring Security BCrypt

**分类**：后端 / 密码安全

**是什么**：Spring Security 内置的 BCrypt 密码编码器，基于 Blowfish 算法。特点是计算速度慢（可配置 rounds），使暴力破解成本极高。

**解决什么问题**：明文存储密码或简单哈希（如 MD5/SHA）在数据库泄露时会被轻易破解。

**在本项目中的用途**：
- 用户注册时哈希密码存入数据库（Part 2 SecurityConfig 配置 PasswordEncoder Bean）
- 用户登录时验证密码（Part 2 AuthService）

**核心 API 示例**：
```java
// [Spring Security] 配置 BCrypt 编码器
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12);  // 12 轮
}

// 哈希密码 — 自动生成 salt
String hash = passwordEncoder.encode(rawPassword);

// 验证密码 — 从 hash 提取 salt 重新计算
boolean matches = passwordEncoder.matches(rawPassword, hash);
```

**常见坑**：
- rounds 不要设太高（12 是推荐值），否则登录响应时间过长
- 永远不要缓存或记录明文密码

---

## 6. Maven

**分类**：工具 / 构建系统

**是什么**：Apache Maven 是 Java 生态最广泛使用的项目管理和构建工具，使用 `pom.xml` 声明式管理依赖和构建流程。

**解决什么问题**：手动管理 Java 依赖（下载 JAR、配置 classpath）极其繁琐且不可移植。

**在本项目中的用途**：
- `pom.xml` 声明所有依赖和插件（Part 1）
- `mvn compile/test/package` 执行构建流程（Part 1）
- CI/CD 中自动执行 Maven 构建（Part 8）

**核心 API 示例**：
```xml
<!-- [Maven] 声明依赖 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>

<!-- [Maven] 常用命令 -->
<!-- mvn compile         编译源码 -->
<!-- mvn test            运行测试 -->
<!-- mvn package         打包为 JAR -->
<!-- mvn spring-boot:run 运行应用 -->
```

**与其他技术的关系**：Maven 从中央仓库下载依赖到本地 `~/.m2/repository`，IDEA 自动同步 Maven 配置。

**常见坑**：
- 依赖冲突时使用 `<exclusions>` 排除传递依赖
- `mvn clean` 清除 `target/` 目录再重新构建
- Spring Boot Parent POM 已管理所有 Spring 依赖版本，无需手动指定

---

## 7. PostgreSQL JDBC Driver

**分类**：数据库 / PostgreSQL 驱动

**是什么**：PostgreSQL 官方 JDBC 驱动（`org.postgresql:postgresql`），是与 PostgreSQL 通信的底层基础。

**在本项目中的用途**：Spring Data JPA（Hibernate）底层通过此驱动连接 PostgreSQL。本项目不直接使用 JDBC API，所有数据库操作通过 JPA Repository 完成。

**常见坑**：
- 驱动版本应与 PostgreSQL 服务端版本兼容
- 连接池（HikariCP）参数要根据并发量合理设置

---

## 8. Spring Data Redis (Lettuce)

**分类**：数据库 / Redis 客户端

**是什么**：Spring Data Redis 是 Spring 对 Redis 的抽象层，默认使用 Lettuce 作为底层连接库。提供 `RedisTemplate` 和 `StringRedisTemplate` 进行类型安全的 Redis 操作。

**解决什么问题**：直接使用 Lettuce/Jedis API 较为底层，Spring Data Redis 提供统一的模板和自动配置。

**在本项目中的用途**：
- 在线状态管理（Redis Set）（Part 4 ConnectionManager）
- 未读消息计数（Redis Hash）
- Pub/Sub 多实例消息同步（Part 4 RedisPubSubManager）
- Token 黑名单（Part 2 JwtTokenProvider）
- 限流计数器（Part 6 RateLimitFilter）
- 文章缓存

**核心 API 示例**：
```java
// [Spring Data Redis] Set 操作 — 在线用户
redisTemplate.opsForSet().add("online:users", userId);
redisTemplate.opsForSet().remove("online:users", userId);
Boolean online = redisTemplate.opsForSet().isMember("online:users", userId);

// [Spring Data Redis] Hash 操作 — 未读计数
redisTemplate.opsForHash().increment("unread:" + userId, roomId, 1);

// [Spring Data Redis] String + TTL
redisTemplate.opsForValue().set("key", "value", Duration.ofMinutes(10));
```

**常见坑**：
- 连接池大小要根据并发量合理设置
- Redis 内存有限，所有 key 都应设置 TTL 或有清理策略
- Pub/Sub 消息是即时的，没有订阅者时消息会丢失

---

## 9. JUnit 5 + Mockito

**分类**：测试 / 测试框架

**是什么**：JUnit 5 是 Java 标准测试框架，Mockito 是最流行的 Mock 框架。Spring Boot Test 整合了两者并提供 `@SpringBootTest`、`@MockBean` 等注解。

**在本项目中的用途**：
- Service 层单元测试（使用 @ExtendWith(MockitoExtension.class)）
- Repository 层集成测试（使用 @DataJpaTest + H2 内存数据库）
- Controller 层测试（使用 MockMvc）

**核心 API 示例**：
```java
// [JUnit 5 + Mockito] 单元测试
@ExtendWith(MockitoExtension.class)
class AuthServiceTest {
    @Mock UserRepository userRepository;
    @InjectMocks AuthService authService;

    @Test
    @DisplayName("登录成功返回 JWT")
    void testLoginSuccess() {
        when(userRepository.findByEmailAndStatusNot(anyString(), anyString()))
            .thenReturn(Optional.of(user));
        // ...
        assertThat(response.getAccessToken()).isNotNull();
    }
}
```

---

## 10. React 19

**分类**：前端 / UI 框架

（前端技术与后端无关，保持原有内容不变。）

---

## 11. Zustand

**分类**：前端 / 状态管理

（前端技术与后端无关，保持原有内容不变。）

---

## 12. TanStack Query

**分类**：前端 / 服务端状态管理

（前端技术与后端无关，保持原有内容不变。）

---

## 13. React Router v7

**分类**：前端 / 路由框架

（前端技术与后端无关，保持原有内容不变。）

---

## 14. TailwindCSS 4

**分类**：前端 / CSS 框架

（前端技术与后端无关，保持原有内容不变。）

---

## 15. Vite + Vitest

**分类**：前端 / 构建与测试工具

（前端技术与后端无关，保持原有内容不变。）

---

## 16. Docker + Docker Compose

**分类**：基础设施 / 容器化

**是什么**：Docker 将应用及其依赖打包为独立容器，Docker Compose 编排多容器应用。

**在本项目中的用途**：
- PostgreSQL 和 Redis 容器化运行（Part 2 首次启动）
- 后端 Java 应用多阶段构建（Part 8 Dockerfile）
- 前端 Nginx 托管（Part 8）
- 生产环境完整编排（Part 8 docker-compose.prod.yml）

**常见坑**：
- Java 应用 Dockerfile 使用多阶段构建减小镜像体积（JDK 编译 → JRE 运行）
- JVM 容器感知需要设置 `-XX:+UseContainerSupport`
- Docker Compose 的 `depends_on` 只保证启动顺序，不保证服务就绪（配合 healthcheck）

---

## 17. Kubernetes

**分类**：基础设施 / 容器编排

**是什么**：生产级容器编排平台，提供自动扩缩容、滚动更新、服务发现等能力。

**在本项目中的用途**：将 Docker Compose 的五个服务迁移到 K8s（Part 9），使用 Deployment + Service + Ingress 模式。

**常见坑**：
- Spring Boot 启动较慢，需要合理配置 startupProbe 和 readinessProbe
- JVM 内存限制要与 K8s resources.limits.memory 匹配
- 使用 ConfigMap 和 Secret 管理配置，不要硬编码在镜像中

---

## 18. IntelliJ IDEA

**分类**：工具 / IDE

**是什么**：JetBrains 出品的 Java IDE，提供代码补全、重构、调试、Spring Boot 集成等全方位开发体验。

**在本项目中的用途**：
- 项目开发和调试（详见 docs/idea-configuration.md）
- Maven 依赖管理和同步
- Spring Boot 运行配置和热部署
- 数据库工具连接 PostgreSQL
- Git 版本控制集成
