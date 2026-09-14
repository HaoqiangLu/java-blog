# Part 2：用户认证 — 第一个业务功能

> **本章目标**：实现注册 / 登录 / 登出 / 刷新 Token。
> 本章不按"先建库再写代码"的顺序，而是**从代码入手**：先搭好异常处理，
> 写认证逻辑时发现用户数据没地方存 → 这时才启动 PostgreSQL、引入 JPA 建表；
> 需要无状态认证时 → 才引入 Spring Security、JWT 与 Redis。
> 每一步引入的依赖和基础设施，都是被代码"逼"出来的。

---

## 2.1 功能目标

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 注册（用户名 + 邮箱 + 密码） |
| `/api/auth/login` | POST | 登录，签发 Access + Refresh Token |
| `/api/auth/logout` | POST | 登出，Token 加入 Redis 黑名单 |
| `/api/auth/refresh` | POST | 用 Refresh Token 换新 Token |

---

## 2.2 全局异常处理

> **说明**：先写与数据库无关的基础代码。业务异常统一抛 `BusinessException`，
> 由 `@RestControllerAdvice` 转换为规范的 JSON 错误响应。
> 本章创建类均按 Part 1 1.5.2 约定的 IDEA 操作：先创建 package（如 `com.blog.exception`），再在其中创建类。

```java
// backend/src/main/java/com/blog/exception/BusinessException.java
// [异常] 业务异常 — 携带 HTTP 状态码和错误消息
package com.blog.exception;

import lombok.Getter;

@Getter
public class BusinessException extends RuntimeException {
    private final int statusCode;

    public BusinessException(int statusCode, String message) {
        super(message);
        this.statusCode = statusCode;
    }
}
```

```java
// backend/src/main/java/com/blog/exception/GlobalExceptionHandler.java
// [Spring] 全局异常处理 — @ControllerAdvice 统一错误响应格式
package com.blog.exception;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Map<String, String>> handleBusiness(BusinessException ex) {
        return ResponseEntity.status(ex.getStatusCode())
                .body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        fe -> fe.getField(),
                        fe -> fe.getDefaultMessage(),
                        (a, b) -> a));
        return ResponseEntity.badRequest()
                .body(Map.of("error", "Validation failed", "details", fieldErrors));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGeneral(Exception ex) {
        return ResponseEntity.internalServerError()
                .body(Map.of("error", "Internal server error"));
    }
}
```

---

## 2.3 用户数据需要持久化 → 引入数据库

注册功能要把用户名、邮箱、密码哈希存起来——内存存不了，至此第一次需要数据库。
下面按"启动容器 → 加依赖 → 加配置 → 建表 → 写实体和 Repository"的顺序引入。

### 2.3.1 启动 PostgreSQL 容器

```powershell
# [PostgreSQL] 开源关系型数据库，本项目主数据库
docker run -d --name blog-postgres `
    -e POSTGRES_USER=bloguser `
    -e POSTGRES_PASSWORD=blogpass123 `
    -e POSTGRES_DB=blogdb `
    -p 5432:5432 `
    --restart unless-stopped `
    postgres:17-alpine

# 验证连接
docker exec blog-postgres pg_isready -U bloguser   # 期望: accepting connections

# 常用管理命令
docker exec -it blog-postgres psql -U bloguser -d blogdb   # 进入 SQL 交互终端
docker stop blog-postgres       # 停止数据库
docker start blog-postgres      # 启动数据库
```

### 2.3.2 添加数据库依赖

在 `backend/pom.xml` 的 `<dependencies>` 中追加：

```xml
<!-- ===== Part 2 用户持久化新增依赖 ===== -->

<!-- [Spring Data JPA] ORM 框架，封装 Hibernate，简化数据库操作 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>

<!-- [PostgreSQL] JDBC 驱动，连接 PostgreSQL 数据库 -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>

<!-- [Flyway] 数据库迁移工具，自动执行 db/migration/ 下的 SQL 脚本 -->
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
</dependency>
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-database-postgresql</artifactId>
</dependency>
```

### 2.3.3 application.yml 追加数据库配置

> **说明**：`application.yml` 在 Part 1 第 1.6 节已创建，位于 `backend/src/main/resources/application.yml`。本节是在已有内容基础上**追加**数据库相关配置，不是新建文件。

在 `application.yml` 的 `spring:` 节点下追加（注意 YAML 缩进）：

```yaml
spring:
  # ---- PostgreSQL 数据源 ----
  datasource:
    url: jdbc:postgresql://${PG_HOST:localhost}:${PG_PORT:5432}/${PG_DATABASE:blogdb}
    username: ${PG_USER:bloguser}
    password: ${PG_PASSWORD:blogpass123}
    driver-class-name: org.postgresql.Driver
    hikari:
      maximum-pool-size: 10
      minimum-idle: 5
      idle-timeout: 300000
      connection-timeout: 20000

  # ---- Spring Data JPA ----
  jpa:
    hibernate:
      ddl-auto: validate          # 表结构由 Flyway 管理，Hibernate 只做校验
    show-sql: false
    properties:
      hibernate:
        format_sql: true
        # Spring Boot 3.x + Hibernate 6 自动根据 JDBC URL 检测 dialect，无需手动指定

  # ---- Flyway 数据库迁移 ----
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
    validate-on-migrate: true
```

同时把日志里的 SQL 输出打开，方便开发期排查：

```yaml
logging:
  level:
    org.hibernate.SQL: DEBUG
```

> **说明**：Flyway 在启动时先执行迁移脚本建表，随后 JPA 以 `validate` 模式校验实体与表结构一致。
> 敏感值（用户名/密码）支持环境变量覆盖，默认值仅供本地开发。

### 2.3.4 建表：用户表

> **说明**：下方 `sql` 代码块是**要保存为文件的内容**，不是在终端执行的命令。
> 创建 `backend/src/main/resources/db/migration/` 目录，按文件名创建 `.sql` 文件。
> 应用启动时 Flyway 自动扫描该目录并按版本号顺序执行。
> 迁移 SQL 均为幂等写法（`IF NOT EXISTS` 等），重复执行不报错。
>
> 验证建表结果：`docker exec blog-postgres psql -U bloguser -d blogdb -c '\dt'`

```sql
-- backend/src/main/resources/db/migration/V001__create_users.sql
-- [PostgreSQL] 用户表 — 存储认证信息和用户资料

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    bio TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'banned', 'deleted'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- [PostgreSQL] 自动更新 updated_at 触发器（后续 V002/V003 的表会复用此函数）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

> **手动执行方式（可选）**：若不想重启应用，也可在容器运行中手动执行迁移文件：
>
> ```powershell
> cd java-blog
> Get-ChildItem backend\src\main\resources\db\migration\*.sql | ForEach-Object {
>     Get-Content $_.FullName | docker exec -i blog-postgres psql -U bloguser -d blogdb
> }
> ```

### 2.3.5 User 实体

> **说明**：以下 Java 文件位于 `backend/src/main/java/com/blog/model/` 目录。
> 使用 JPA 注解映射数据库表，Lombok 注解自动生成 getter/setter/builder。

```java
// backend/src/main/java/com/blog/model/User.java
// [JPA] 用户实体 — 映射 PostgreSQL users 表
package com.blog.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 255)
    private String username;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "display_name", length = 100)
    private String displayName;

    @Column(name = "avatar_url", columnDefinition = "TEXT")
    private String avatarUrl;

    @Column(columnDefinition = "TEXT")
    @Builder.Default
    private String bio = "";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(length = 20)
    @Builder.Default
    private String status = "active";

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

### 2.3.6 UserRepository

> **说明**：Spring Data JPA 只需定义接口，框架在运行时自动生成实现。
> 方法名如 `findByEmailAndStatusNot` 会自动翻译为
> `SELECT * FROM users WHERE email = ? AND status != ?`；复杂查询用 `@Query`。

```java
// backend/src/main/java/com/blog/repository/UserRepository.java
// [Spring Data JPA] 用户数据访问层 — 接口继承 JpaRepository 自动获得 CRUD 方法
package com.blog.repository;

import com.blog.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByIdAndStatusNot(UUID id, String status);

    Optional<User> findByEmailAndStatusNot(String email, String status);

    Optional<User> findByUsernameAndStatusNot(String username, String status);

    Page<User> findByStatusNot(String status, Pageable pageable);

    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.status = 'deleted' WHERE u.id = :id")
    int softDelete(UUID id);

    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.passwordHash = :newHash WHERE u.id = :id")
    int updatePassword(UUID id, String newHash);
}
```

---

## 2.4 认证需要安全保障 → 引入 Security + JWT + Redis

登录接口要校验密码、签发令牌；登出要让令牌立即失效（JWT 本身无状态，需要 Redis 存黑名单）。
至此引入 Spring Security、jjwt、Validation 与 Redis。

### 2.4.1 添加安全相关依赖

在 `backend/pom.xml` 的 `<dependencies>` 中追加：

```xml
<!-- ===== Part 2 认证新增依赖 ===== -->

<!-- [Spring Security] 安全框架 — 认证、授权、密码加密、CSRF 防护 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>

<!-- [jjwt] JWT 认证库 — 令牌签发与验证 -->
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>${jjwt.version}</version>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <version>${jjwt.version}</version>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <version>${jjwt.version}</version>
    <scope>runtime</scope>
</dependency>

<!-- [Spring Boot Validation] 参数校验注解支持（@Valid, @NotNull 等） -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>

<!-- [Spring Data Redis] Redis 客户端与模板，基于 Lettuce 连接池 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

### 2.4.2 启动 Redis 容器

```powershell
# [Redis] 内存键值数据库，本章用于 JWT 黑名单（后续章节还用于在线状态、限流、Pub/Sub）
docker run -d --name blog-redis `
    -p 6379:6379 `
    --restart unless-stopped `
    redis:7-alpine `
    redis-server --requirepass redispass123 --appendonly yes

# 验证连接
docker exec blog-redis redis-cli -a redispass123 ping   # 期望: PONG
```

### 2.4.3 application.yml 追加 Redis 与 JWT 配置

在 `application.yml` 的 `spring:` 节点下追加：

```yaml
spring:
  # ---- Spring Data Redis ----
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:redispass123}
      timeout: 5000ms
      lettuce:
        pool:
          max-active: 16
          max-idle: 8
          min-idle: 4
```

在文件末尾追加自定义配置节点：

```yaml
# ---- 自定义配置 ----
app:
  jwt:
    secret: ${JWT_SECRET:your-super-secret-jwt-key-change-in-production}
    expiration: ${JWT_EXPIRATION:3600}         # Access Token 过期时间（秒）
    refresh-expiration: ${JWT_REFRESH_EXPIRATION:604800}  # Refresh Token（7天）

  cors:
    allowed-origins: ${CORS_ORIGIN:http://localhost:3000}
```

### 2.4.4 JwtTokenProvider

```java
// backend/src/main/java/com/blog/security/JwtTokenProvider.java
// [jjwt] JWT 工具类 — 无状态认证令牌的签发与验证
package com.blog.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.concurrent.TimeUnit;

@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long expirationMs;
    private final long refreshExpirationMs;
    private final StringRedisTemplate redisTemplate;

    public JwtTokenProvider(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration}") long expirationSec,
            @Value("${app.jwt.refresh-expiration}") long refreshExpirationSec,
            StringRedisTemplate redisTemplate) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationSec * 1000;
        this.refreshExpirationMs = refreshExpirationSec * 1000;
        this.redisTemplate = redisTemplate;
    }

    public String generateAccessToken(String userId, String username, String email) {
        return Jwts.builder()
                .subject(userId)
                .claim("username", username)
                .claim("email", email)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key)
                .compact();
    }

    public String generateRefreshToken(String userId) {
        return Jwts.builder()
                .subject(userId)
                .claim("type", "refresh")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + refreshExpirationMs))
                .signWith(key)
                .compact();
    }

    public Claims validateToken(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean isTokenValid(String token) {
        try {
            if (isBlacklisted(token)) return false;
            validateToken(token);
            return true;
        } catch (JwtException e) {
            return false;
        }
    }

    public void blacklistToken(String token) {
        try {
            Claims claims = validateToken(token);
            long remaining = claims.getExpiration().getTime() - System.currentTimeMillis();
            if (remaining > 0) {
                // [Redis] 黑名单 Token，TTL = 剩余有效时间
                redisTemplate.opsForValue().set(
                        "session:" + token, "blacklisted",
                        remaining, TimeUnit.MILLISECONDS);
            }
        } catch (JwtException ignored) {}
    }

    private boolean isBlacklisted(String token) {
        return Boolean.TRUE.equals(redisTemplate.hasKey("session:" + token));
    }
}
```

> **Redis Key 说明**：本章仅使用 `session:{token}`（String，JWT 黑名单，TTL 与令牌剩余有效期一致）。
> 完整的 Redis 数据结构设计（在线状态、房间成员、未读计数等）见 Part 4。

### 2.4.5 JwtAuthenticationFilter

```java
// backend/src/main/java/com/blog/security/JwtAuthenticationFilter.java
// [Spring Security] JWT 认证过滤器 — 从请求头提取并验证 Bearer Token
package com.blog.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import io.jsonwebtoken.Claims;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;

    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String token = extractToken(request);

        if (token != null && tokenProvider.isTokenValid(token)) {
            Claims claims = tokenProvider.validateToken(token);
            String userId = claims.getSubject();
            String username = claims.get("username", String.class);

            // [Spring Security] 将用户信息注入 SecurityContext
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(
                            userId, null, Collections.emptyList());
            auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (bearer != null && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        return null;
    }
}
```

### 2.4.6 CustomUserDetailsService

```java
// backend/src/main/java/com/blog/security/CustomUserDetailsService.java
// [Spring Security] UserDetailsService 实现 — 从数据库加载用户信息
package com.blog.security;

import com.blog.model.User;
import com.blog.repository.UserRepository;
import org.springframework.security.core.userdetails.*;
import org.springframework.stereotype.Service;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public CustomUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmailAndStatusNot(email, "deleted")
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + email));

        return org.springframework.security.core.userdetails.User.builder()
                .username(user.getId().toString())  // 以 userId 作为 principal
                .password(user.getPasswordHash())
                .authorities("ROLE_USER")
                .build();
    }
}
```

### 2.4.7 SecurityConfig

> **说明**：初版只放行本章的认证接口和健康检查，其余接口一律要求登录。
> 后续每新增公开接口再回来扩充白名单（Part 3 放行文章/搜索，Part 4 放行 WebSocket）。

```java
// backend/src/main/java/com/blog/config/SecurityConfig.java
// [Spring Security] 安全配置 — CORS、CSRF、公开路径、过滤器链
package com.blog.config;

import com.blog.security.JwtAuthenticationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtFilter;

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthenticationFilter jwtFilter) {
        this.jwtFilter = jwtFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())  // JWT 无状态，无需 CSRF
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // 公开接口（后续章节逐步扩充）
                .requestMatchers(
                    "/api/auth/login",
                    "/api/auth/register",
                    "/api/auth/refresh",
                    "/api/health"
                ).permitAll()
                // 其余接口需认证
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // [Spring Security] BCrypt 密码编码器，自带 salt 防彩虹表
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "Authorization"));
        config.setAllowCredentials(true);
        config.setMaxAge(86400L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
```

### 2.4.8 RedisConfig

```java
// backend/src/main/java/com/blog/config/RedisConfig.java
// [Spring Data Redis] Redis 配置 — 序列化与模板
package com.blog.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        // [Redis] Key 使用 String 序列化，Value 使用 JSON 序列化
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());
        template.afterPropertiesSet();
        return template;
    }

    // [Redis Pub/Sub] 消息监听容器 — Part 4 RedisPubSubManager 依赖此 Bean 订阅频道
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(RedisConnectionFactory factory) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        return container;
    }
}
```

---

## 2.5 认证 DTO

```java
// backend/src/main/java/com/blog/dto/request/LoginRequest.java
package com.blog.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class LoginRequest {
    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be 8+ chars")
    private String password;
}
```

```java
// backend/src/main/java/com/blog/dto/request/RegisterRequest.java
package com.blog.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class RegisterRequest {
    @NotBlank @Size(min = 3, max = 50, message = "Username must be 3-50 chars")
    private String username;

    @NotBlank @Email
    private String email;

    @NotBlank @Size(min = 8)
    private String password;
}
```

```java
// backend/src/main/java/com/blog/dto/response/AuthResponse.java
package com.blog.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;
import java.util.Map;

@Data @Builder
public class AuthResponse {
    // [Jackson] @JsonProperty 保证 JSON 输出为 snake_case，与前端 TypeScript 类型定义一致
    @JsonProperty("access_token")
    private String accessToken;
    @JsonProperty("refresh_token")
    private String refreshToken;
    @JsonProperty("token_type")
    private String tokenType;
    @JsonProperty("expires_in")
    private long expiresIn;
    private Map<String, Object> user;
}
```

---

## 2.6 AuthService 与 AuthController

### 2.6.1 AuthService

```java
// backend/src/main/java/com/blog/service/AuthService.java
// [Service] 认证业务逻辑 — 注册/登录/登出/刷新
package com.blog.service;

import com.blog.dto.request.LoginRequest;
import com.blog.dto.request.RegisterRequest;
import com.blog.dto.response.AuthResponse;
import com.blog.exception.BusinessException;
import com.blog.model.User;
import com.blog.repository.UserRepository;
import com.blog.security.JwtTokenProvider;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
    }

    @Transactional
    public Map<String, Object> register(RegisterRequest request) {
        if (userRepository.findByUsernameAndStatusNot(request.getUsername(), "deleted").isPresent()) {
            throw new BusinessException(409, "Username taken");
        }
        if (userRepository.findByEmailAndStatusNot(request.getEmail(), "deleted").isPresent()) {
            throw new BusinessException(409, "Email registered");
        }

        User user = User.builder()
                .username(request.getUsername())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .status("active")
                .bio("")
                .build();
        user = userRepository.save(user);

        return Map.of("message", "Registered", "user_id", user.getId().toString());
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmailAndStatusNot(request.getEmail(), "deleted")
                .orElseThrow(() -> new BusinessException(401, "Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BusinessException(401, "Invalid email or password");
        }

        String accessToken = tokenProvider.generateAccessToken(
                user.getId().toString(), user.getUsername(), user.getEmail());
        String refreshToken = tokenProvider.generateRefreshToken(user.getId().toString());

        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", user.getId().toString());
        userMap.put("username", user.getUsername());
        userMap.put("email", user.getEmail());
        userMap.put("displayName", user.getDisplayName());
        userMap.put("avatarUrl", user.getAvatarUrl());
        userMap.put("bio", user.getBio());
        userMap.put("status", user.getStatus());

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(3600)
                .user(userMap)
                .build();
    }

    public void logout(String token) {
        tokenProvider.blacklistToken(token);
    }

    public AuthResponse refreshToken(String refreshToken) {
        if (!tokenProvider.isTokenValid(refreshToken)) {
            throw new BusinessException(401, "Invalid refresh token");
        }
        var claims = tokenProvider.validateToken(refreshToken);
        String userId = claims.getSubject();

        User user = userRepository.findByIdAndStatusNot(UUID.fromString(userId), "deleted")
                .orElseThrow(() -> new BusinessException(401, "User not found"));

        String newAccess = tokenProvider.generateAccessToken(
                user.getId().toString(), user.getUsername(), user.getEmail());
        String newRefresh = tokenProvider.generateRefreshToken(user.getId().toString());

        return AuthResponse.builder()
                .accessToken(newAccess)
                .refreshToken(newRefresh)
                .tokenType("Bearer")
                .expiresIn(3600)
                .build();
    }
}
```

### 2.6.2 AuthController

```java
// backend/src/main/java/com/blog/controller/AuthController.java
// [Spring MVC] 认证控制器 — 注册/登录/登出/刷新 Token
package com.blog.controller;

import com.blog.dto.request.LoginRequest;
import com.blog.dto.request.RegisterRequest;
import com.blog.dto.response.AuthResponse;
import com.blog.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.ok(authService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(@RequestHeader("Authorization") String auth) {
        String token = auth.replace("Bearer ", "");
        authService.logout(token);
        return ResponseEntity.ok(Map.of("message", "Logged out"));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.refreshToken(body.get("refresh_token")));
    }
}
```

---

## 2.7 验证认证流程

### 启动应用

Flyway 会在应用启动时自动执行 `db/migration/` 下的迁移脚本（V001 建 users 表）。

**方式一：IDEA 中启动（推荐）**

有两种方式，任选其一：

- **Maven 面板启动**：打开 IDEA 右侧 **Maven** 工具窗口 → 展开 `backend` → **Plugins** → **spring-boot** → 双击 **spring-boot:run**。日志中看到 `Started Application in X.XX seconds` 即表示成功。
- **Run 按钮启动**：打开 `Application.java`，点击类名左侧的 **绿色三角形 ▶** → **Run 'Application'**。

> 两种方式效果相同，Maven 面板方式与命令行 `mvn spring-boot:run` 完全等价。
> 区别在于：
>   Maven 面板走完整的 Maven 构建生命周期（能验证 Maven 配置是否正确）；
>   Run 按钮使用 IDEA 内置编译器（启动更快，适合日常开发调试）。

**方式二：命令行启动**

```powershell
cd d:\Program\Java\blog-project\java-blog\backend
mvn spring-boot:run
```

> **注意**：`mvn spring-boot:run` 必须在 `backend/` 目录下执行（即 `pom.xml` 所在目录），否则会报 "pom.xml not found"。

### 验证接口

应用启动后，打开 PowerShell 按顺序验证：

```powershell
# 注意：PowerShell 5.1 的 Invoke-RestMethod 传 hashtable 给 -Body 时，
# 即使设了 -ContentType 'application/json'，实际仍按表单格式发送。
# 必须先用 ConvertTo-Json 将 hashtable 转为 JSON 字符串，再传给 -Body。

# 1. 注册
$body = @{username='alice'; email='alice@example.com'; password='password123'} | ConvertTo-Json
$resp = Invoke-RestMethod -Uri http://localhost:8080/api/auth/register `
    -Method POST -ContentType 'application/json' -Body $body
$resp
# 期望: message=Registered user_id=...

# 2. 登录（记下返回的 access_token / refresh_token）
$body = @{email='alice@example.com'; password='password123'} | ConvertTo-Json
$login = Invoke-RestMethod -Uri http://localhost:8080/api/auth/login `
    -Method POST -ContentType 'application/json' -Body $body
$login
# 期望: access_token=eyJ... refresh_token=... token_type=Bearer ...

# 3. 校验参数生效（密码过短应返回 400 + Validation failed）
$body = @{username='bob'; email='bob@example.com'; password='123'} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8080/api/auth/register `
    -Method POST -ContentType 'application/json' -Body $body

# 4. 登出（将 <TOKEN> 替换为登录返回的 access_token）
Invoke-RestMethod -Uri http://localhost:8080/api/auth/logout `
    -Method POST -Headers @{Authorization='Bearer <TOKEN>'}
# 期望: message=Logged out；此后该 Token 再请求受保护接口应返回 401/403
# 若执行过上面的内容，忘记了access_token，可以执行下面命令
$token = $login.access_token
Invoke-RestMethod -Uri http://localhost:8080/api/auth/logout -Method POST -Headers @{Authorization="Bearer $token"}

# 5. 刷新 Token
$body = @{refresh_token='<REFRESH_TOKEN>'} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8080/api/auth/refresh `
    -Method POST -ContentType 'application/json' -Body $body
# 若执行过上面的内容，忘记了refresh_token，可以执行下面命令
$body = @{refresh_token=$login.refresh_token} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8080/api/auth/refresh -Method POST -ContentType 'application/json' -Body $body
```

> **下一步**：Part 3 开发第二个功能「文章与评论」——同样从代码需求出发，
> 需要存文章时才建 posts 表、需要分页响应时才写 PageResponse，
> 并回头增量修改本章的 SecurityConfig 放行新的公开接口。
