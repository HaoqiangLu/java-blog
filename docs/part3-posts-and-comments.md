# Part 3：文章与评论 — 核心内容功能

> **本章目标**：实现文章的发布/编辑/删除/分页列表/全文搜索，以及文章的嵌套评论。
> 延续 Part 2 的开发方式：先明确接口，写代码时撞到"文章没地方存"才建 posts 表，
> 撞到"评论要嵌套展示"才写评论树组装逻辑，并回头增量修改 SecurityConfig 放行新接口。
> 本章不新增任何 Maven 依赖——所需能力（JPA / Security / Validation）Part 2 已具备。

---

## 3.1 功能目标

| 接口 | 方法 | 说明 | 认证 |
|------|------|------|------|
| `/api/posts` | GET | 分页文章列表 | 公开 |
| `/api/posts/my-posts` | GET | 当前用户所有文章（不限状态） | 需登录 |
| `/api/posts/{id}` | GET | 文章详情（浏览量 +1） | 公开 |
| `/api/posts` | POST | 创建文章 | 需登录 |
| `/api/posts/{id}` | PUT | 更新文章（仅作者） | 需登录 |
| `/api/posts/{id}` | DELETE | 删除文章（仅作者） | 需登录 |
| `/api/search` | GET | 全文搜索 | 公开 |
| `/api/posts/{postId}/comments` | GET | 评论树 | 公开 |
| `/api/posts/{postId}/comments` | POST | 发表评论 | 需登录 |

---

## 3.2 文章需要持久化 → 建 posts 表

### 3.2.1 建表：文章表

> **说明**：在 `backend/src/main/resources/db/migration/` 下新建迁移文件。
> Flyway 按版本号顺序执行，V002 依赖 V001 已创建的 `users` 表与 `update_updated_at_column()` 函数。
> 表中同时建好全文搜索（tsvector）与模糊搜索（pg_trgm）所需结构，供 3.6 节的搜索功能使用。

```sql
-- backend/src/main/resources/db/migration/V002__create_posts.sql
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) NOT NULL UNIQUE,
    content TEXT NOT NULL DEFAULT '',
    content_html TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    cover_image TEXT,
    tags TEXT[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    search_vector tsvector
);

CREATE INDEX idx_posts_status_published ON posts(status, published_at DESC)
    WHERE status = 'published';
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_posts_title_trgm ON posts USING GIN(title gin_trgm_ops);

CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_posts_search_vector
    BEFORE INSERT OR UPDATE OF title, content ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_search_vector();

CREATE INDEX idx_posts_search_vector ON posts USING GIN(search_vector);

CREATE TRIGGER trigger_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 3.2.2 Post 实体

```java
// backend/src/main/java/com/blog/model/Post.java
package com.blog.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "posts")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @JsonProperty("author_id")
    @Column(name = "author_id", nullable = false)
    private UUID authorId;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(nullable = false, unique = true, length = 500)
    private String slug;

    @Column(columnDefinition = "TEXT")
    @Builder.Default
    private String content = "";

    @JsonProperty("content_html")
    @Column(name = "content_html", columnDefinition = "TEXT")
    @Builder.Default
    private String contentHtml = "";

    @Column(columnDefinition = "TEXT")
    @Builder.Default
    private String summary = "";

    @JsonProperty("cover_image")
    @Column(name = "cover_image", columnDefinition = "TEXT")
    private String coverImage;

    // [PostgreSQL] TEXT[] 数组类型 — Hibernate 6 自动映射 List<String> ↔ text[]
    @Column(columnDefinition = "text[]")
    @Builder.Default
    private List<String> tags = new ArrayList<>();

    @Column(length = 20)
    @Builder.Default
    private String status = "draft";

    @JsonProperty("view_count")
    @Column(name = "view_count")
    @Builder.Default
    private Integer viewCount = 0;

    @JsonProperty("like_count")
    @Column(name = "like_count")
    @Builder.Default
    private Integer likeCount = 0;

    @JsonProperty("created_at")
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @JsonProperty("updated_at")
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @JsonProperty("published_at")
    @Column(name = "published_at")
    private Instant publishedAt;

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

### 3.2.3 PostRepository

```java
// backend/src/main/java/com/blog/repository/PostRepository.java
package com.blog.repository;

import com.blog.model.Post;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PostRepository extends JpaRepository<Post, UUID> {

    Optional<Post> findBySlug(String slug);

    Page<Post> findByStatus(String status, Pageable pageable);

    Page<Post> findByAuthorId(UUID authorId, Pageable pageable);

    // [PostgreSQL] 数组包含查询 — 查找包含指定标签的文章（Hibernate 6 JPQL 不支持 ANY，改用原生 SQL）
    @Query(value = "SELECT * FROM posts WHERE :tag = ANY(tags) AND status = 'published'",
            nativeQuery = true)
    Page<Post> findByTag(String tag, Pageable pageable);

    // [PostgreSQL] 全文搜索 — 使用原生 SQL 调用 tsquery
    @Query(value = "SELECT * FROM posts WHERE status = 'published' " +
           "AND search_vector @@ plainto_tsquery('english', :query) " +
           "ORDER BY ts_rank(search_vector, plainto_tsquery('english', :query)) DESC",
           nativeQuery = true)
    Page<Post> search(String query, Pageable pageable);

    @Modifying
    @Transactional
    @Query("UPDATE Post p SET p.viewCount = p.viewCount + 1 WHERE p.id = :id")
    int incrementViewCount(UUID id);

    // [点赞] 与 incrementViewCount 同构 — like_count 自增 1
    @Modifying
    @Transactional
    @Query("UPDATE Post p SET p.likeCount = p.likeCount + 1 WHERE p.id = :id")
    int incrementLikeCount(UUID id);

    long countByStatus(String status);
}
```

---

## 3.3 评论需要持久化 → 建 comments 表

### 3.3.1 建表：评论表

```sql
-- backend/src/main/resources/db/migration/V003__create_comments.sql
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_comments_post_id ON comments(post_id, created_at ASC);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id) WHERE parent_id IS NOT NULL;

CREATE TRIGGER trigger_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 3.3.2 Comment 实体

```java
// backend/src/main/java/com/blog/model/Comment.java
package com.blog.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "comments")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Comment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @JsonProperty("post_id")
    @Column(name = "post_id", nullable = false)
    private UUID postId;

    @JsonProperty("author_id")
    @Column(name = "author_id", nullable = false)
    private UUID authorId;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    @JsonProperty("parent_id")
    @Column(name = "parent_id")
    private UUID parentId;

    @JsonProperty("created_at")
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @JsonProperty("updated_at")
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @JsonProperty("is_deleted")
    @Column(name = "is_deleted")
    @Builder.Default
    private Boolean isDeleted = false;

    // 嵌套回复（非数据库字段，Service 层组装）
    @Transient
    @Builder.Default
    private List<Comment> replies = new ArrayList<>();

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

### 3.3.3 CommentRepository

```java
// backend/src/main/java/com/blog/repository/CommentRepository.java
package com.blog.repository;

import com.blog.model.Comment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CommentRepository extends JpaRepository<Comment, UUID> {

    List<Comment> findByPostIdAndParentIdIsNullOrderByCreatedAtAsc(UUID postId);

    List<Comment> findByParentIdOrderByCreatedAtAsc(UUID parentId);

    List<Comment> findByPostIdOrderByCreatedAtAsc(UUID postId);
}
```

---

## 3.4 请求与分页响应 DTO

```java
// backend/src/main/java/com/blog/dto/request/CreatePostRequest.java
package com.blog.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;
import java.util.List;

@Data
public class CreatePostRequest {
    @NotBlank @Size(max = 500)
    private String title;

    private String content;
    private String summary;
    private String coverImage;
    private List<String> tags;
    private String status;  // "draft" or "published"
}
```

```java
// backend/src/main/java/com/blog/dto/response/PageResponse.java
package com.blog.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;
import java.util.List;

@Data @Builder
public class PageResponse<T> {
    // [Jackson] @JsonProperty("items") 保证 JSON 字段名与前端 PaginatedResponse 类型一致
    @JsonProperty("items")
    private List<T> content;
    private int page;
    @JsonProperty("page_size")
    private int pageSize;
    private long total;
    @JsonProperty("has_more")
    private boolean hasMore;
}
```

---

## 3.5 增量修改 SecurityConfig：放行文章与搜索接口

文章列表、文章详情、评论查看和搜索应对未登录用户开放，但创建/更新/删除需要登录。
回到 Part 2 创建的 `com/blog/config/SecurityConfig.java`，在 `requestMatchers(...)` 中区分 GET 和其他方法：

```java
// 需要添加 import: import org.springframework.http.HttpMethod;

.authorizeHttpRequests(auth -> auth
    // 公开接口（无需认证）
    .requestMatchers(
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/refresh",
        "/api/health"
    ).permitAll()
    // [Part 3] 只放行 GET 请求，POST/PUT/DELETE 需要认证
    // 注意：/my-posts 需要认证才能获取用户 ID，必须在通配规则之前声明
    .requestMatchers("/api/posts/my-posts").authenticated()
    .requestMatchers(HttpMethod.GET, "/api/posts/**").permitAll()
    .requestMatchers(HttpMethod.GET, "/api/search/**").permitAll()
    // 其余接口需认证
    .anyRequest().authenticated()
)
```

> **说明**：`/api/posts/**` 的 GET 请求（列表、详情）对所有人开放，
> POST/PUT/DELETE 需要携带有效 JWT Token，由 Controller 层通过 `Authentication` 参数获取用户身份并校验作者权限。

---

## 3.6 Service 与 Controller 层

### 3.6.1 PostService

```java
// backend/src/main/java/com/blog/service/PostService.java
package com.blog.service;

import com.blog.dto.request.CreatePostRequest;
import com.blog.dto.response.PageResponse;
import com.blog.exception.BusinessException;
import com.blog.model.Post;
import com.blog.repository.PostRepository;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class PostService {

    private final PostRepository postRepository;

    public PostService(PostRepository postRepository) {
        this.postRepository = postRepository;
    }

    public Post getPost(UUID id) {
        return postRepository.findById(id)
                .orElseThrow(() -> new BusinessException(404, "Post not found"));
    }

    public PageResponse<Map<String, Object>> listPosts(String status, int page, int pageSize) {
        Pageable pageable = PageRequest.of(page - 1, pageSize, Sort.by("createdAt").descending());
        Page<Post> postPage = postRepository.findByStatus(status, pageable);

        List<Map<String, Object>> content = postPage.getContent().stream()
                .map(this::toListMap)
                .toList();

        return PageResponse.<Map<String, Object>>builder()
                .content(content)
                .page(page)
                .pageSize(pageSize)
                .total(postPage.getTotalElements())
                .hasMore(postPage.hasNext())
                .build();
    }

    // [新增] 按作者查询 — Home 页面展示当前用户的所有文章（不限状态）
    public PageResponse<Map<String, Object>> listPostsByAuthor(UUID authorId, int page, int pageSize) {
        Pageable pageable = PageRequest.of(page - 1, pageSize, Sort.by("updatedAt").descending());
        Page<Post> postPage = postRepository.findByAuthorId(authorId, pageable);

        List<Map<String, Object>> content = postPage.getContent().stream()
                .map(this::toListMap)
                .toList();

        return PageResponse.<Map<String, Object>>builder()
                .content(content)
                .page(page)
                .pageSize(pageSize)
                .total(postPage.getTotalElements())
                .hasMore(postPage.hasNext())
                .build();
    }

    @Transactional
    public Post createPost(UUID authorId, CreatePostRequest request) {
        Post post = Post.builder()
                .authorId(authorId)
                .title(request.getTitle())
                .slug(generateSlug(request.getTitle()))
                .content(request.getContent() != null ? request.getContent() : "")
                .summary(request.getSummary() != null ? request.getSummary() : "")
                .coverImage(request.getCoverImage())
                .tags(request.getTags() != null ? request.getTags() : new ArrayList<>())
                .status(request.getStatus() != null ? request.getStatus() : "draft")
                .build();

        if ("published".equals(post.getStatus())) {
            post.setPublishedAt(Instant.now());
        }

        return postRepository.save(post);
    }

    @Transactional
    public Post updatePost(UUID postId, UUID userId, CreatePostRequest request) {
        Post post = getPost(postId);
        if (!post.getAuthorId().equals(userId)) {
            throw new BusinessException(403, "Not the author");
        }

        post.setTitle(request.getTitle());
        post.setSlug(generateSlug(request.getTitle()));
        if (request.getContent() != null) post.setContent(request.getContent());
        if (request.getSummary() != null) post.setSummary(request.getSummary());
        if (request.getCoverImage() != null) post.setCoverImage(request.getCoverImage());
        if (request.getTags() != null) post.setTags(request.getTags());
        if (request.getStatus() != null) {
            if ("published".equals(request.getStatus()) && post.getPublishedAt() == null) {
                post.setPublishedAt(Instant.now());
            }
            post.setStatus(request.getStatus());
        }

        return postRepository.save(post);
    }

    @Transactional
    public void deletePost(UUID postId, UUID userId) {
        Post post = getPost(postId);
        if (!post.getAuthorId().equals(userId)) {
            throw new BusinessException(403, "Not the author");
        }
        postRepository.delete(post);
    }

    @Transactional
    public void incrementViewCount(UUID id) {
        postRepository.incrementViewCount(id);
    }

    // [点赞] 自增 like_count 后返回最新 Post，供前端刷新计数
    @Transactional
    public Post likePost(UUID id) {
        postRepository.incrementLikeCount(id);
        return getPost(id);
    }

    // [PostgreSQL] 全文搜索 — 委托 PostRepository.search() 使用 tsvector
    public PageResponse<Map<String, Object>> searchPosts(String query, int page, int pageSize) {
        Pageable pageable = PageRequest.of(page - 1, pageSize);
        Page<Post> resultPage = postRepository.search(query, pageable);

        List<Map<String, Object>> content = resultPage.getContent().stream()
                .map(this::toListMap)
                .toList();

        return PageResponse.<Map<String, Object>>builder()
                .content(content)
                .page(page)
                .pageSize(pageSize)
                .total(resultPage.getTotalElements())
                .hasMore(resultPage.hasNext())
                .build();
    }

    private String generateSlug(String title) {
        String cleaned = title.toLowerCase()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");
        // 陷阱：substring 的上界必须用清洗后字符串自己的长度。
        // 原实现用 Math.min(title.length(), 200)：中文标题清洗后只剩英文部分
        // （如"深入理解 Spring Boot …"→ "spring-boot" 仅 13 字符），
        // 按原标题长度 33 截取直接抛 StringIndexOutOfBoundsException → POST /api/posts 500
        if (cleaned.isEmpty()) {
            cleaned = "post";   // 纯中文标题清洗后为空时的兜底
        }
        if (cleaned.length() > 200) {
            cleaned = cleaned.substring(0, 200);
        }
        return cleaned + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private Map<String, Object> toListMap(Post post) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", post.getId());
        map.put("author_id", post.getAuthorId());
        map.put("title", post.getTitle());
        map.put("slug", post.getSlug());
        map.put("summary", post.getSummary());
        map.put("cover_image", post.getCoverImage());
        map.put("tags", post.getTags());
        map.put("status", post.getStatus());
        map.put("view_count", post.getViewCount());
        map.put("like_count", post.getLikeCount());
        map.put("created_at", post.getCreatedAt());
        map.put("published_at", post.getPublishedAt());
        map.put("updated_at", post.getUpdatedAt());
        return map;
    }
}
```

### 3.6.2 CommentService

```java
// backend/src/main/java/com/blog/service/CommentService.java
// [Service] 评论业务逻辑 — 创建评论、查询评论树
package com.blog.service;

import com.blog.model.Comment;
import com.blog.repository.CommentRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class CommentService {

    private final CommentRepository commentRepository;

    public CommentService(CommentRepository commentRepository) {
        this.commentRepository = commentRepository;
    }

    // 查询某篇文章的顶级评论（parent_id 为 null），并组装嵌套回复
    public List<Comment> getCommentsForPost(UUID postId) {
        List<Comment> topLevel = commentRepository
                .findByPostIdAndParentIdIsNullOrderByCreatedAtAsc(postId);
        // 为每个顶级评论加载直接回复
        for (Comment comment : topLevel) {
            List<Comment> replies = commentRepository
                    .findByParentIdOrderByCreatedAtAsc(comment.getId());
            comment.setReplies(replies);
        }
        return topLevel;
    }

    public Comment createComment(UUID postId, UUID authorId, String content, String parentId) {
        Comment comment = Comment.builder()
                .postId(postId)
                .authorId(authorId)
                .content(content)
                .parentId(parentId != null ? UUID.fromString(parentId) : null)
                .isDeleted(false)
                .build();
        return commentRepository.save(comment);
    }
}
```

### 3.6.3 PostController

```java
// backend/src/main/java/com/blog/controller/PostController.java
package com.blog.controller;

import com.blog.dto.request.CreatePostRequest;
import com.blog.dto.response.PageResponse;
import com.blog.model.Post;
import com.blog.service.PostService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/posts")
public class PostController {

    private final PostService postService;

    public PostController(PostService postService) {
        this.postService = postService;
    }

    @GetMapping
    public ResponseEntity<PageResponse<Map<String, Object>>> listPosts(
            @RequestParam(defaultValue = "published") String status,
            @RequestParam(defaultValue = "1") int page,
            // [Spring MVC] @RequestParam("page_size") 接收前端传递的 snake_case 参数名
            @RequestParam(value = "page_size", defaultValue = "20") int pageSize) {
        return ResponseEntity.ok(postService.listPosts(status, page, pageSize));
    }

    // [新增] 当前用户的所有文章（不限状态）— Home 页面使用
    @GetMapping("/my-posts")
    public ResponseEntity<PageResponse<Map<String, Object>>> myPosts(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(value = "page_size", defaultValue = "20") int pageSize,
            Authentication auth) {
        UUID userId = UUID.fromString((String) auth.getPrincipal());
        return ResponseEntity.ok(postService.listPostsByAuthor(userId, page, pageSize));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Post> getPost(@PathVariable UUID id) {
        postService.incrementViewCount(id);
        return ResponseEntity.ok(postService.getPost(id));
    }

    // [点赞] POST /api/posts/{id}/like — 需登录（走 anyRequest().authenticated()）
    @PostMapping("/{id}/like")
    public ResponseEntity<Post> likePost(@PathVariable UUID id) {
        return ResponseEntity.ok(postService.likePost(id));
    }

    @PostMapping
    public ResponseEntity<Post> createPost(@Valid @RequestBody CreatePostRequest request,
                                           Authentication auth) {
        UUID userId = UUID.fromString((String) auth.getPrincipal());
        return ResponseEntity.ok(postService.createPost(userId, request));
    }

    @PutMapping("/{id}")    
    public ResponseEntity<Post> updatePost(@PathVariable UUID id,
                                           @Valid @RequestBody CreatePostRequest request,
                                           Authentication auth) {
        UUID userId = UUID.fromString((String) auth.getPrincipal());
        return ResponseEntity.ok(postService.updatePost(id, userId, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePost(@PathVariable UUID id, Authentication auth) {
        UUID userId = UUID.fromString((String) auth.getPrincipal());
        postService.deletePost(id, userId);
        return ResponseEntity.noContent().build();
    }
}
```

> **说明**：`/api/posts/**` 已在 SecurityConfig 中整体放行，为什么写操作仍安全？
> 未登录请求不会携带有效 Token，`Authentication auth` 为 null 时 Spring 会拒绝注入并返回错误；
> 登录用户只能修改/删除自己的文章，作者校验在 Service 层完成。
> 若希望更严格，可在 Part 6 安全加固章节配合限流进一步防护。

### 3.6.4 CommentController

```java
// backend/src/main/java/com/blog/controller/CommentController.java
// [Spring MVC] 评论控制器 — 文章评论的查询与创建
package com.blog.controller;

import com.blog.model.Comment;
import com.blog.service.CommentService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/posts/{postId}/comments")
public class CommentController {

    private final CommentService commentService;

    public CommentController(CommentService commentService) {
        this.commentService = commentService;
    }

    // [GET] 获取某篇文章的评论树（公开接口）
    @GetMapping
    public ResponseEntity<List<Comment>> getComments(@PathVariable UUID postId) {
        return ResponseEntity.ok(commentService.getCommentsForPost(postId));
    }

    // [POST] 创建评论（需登录）
    @PostMapping
    public ResponseEntity<Comment> createComment(@PathVariable UUID postId,
                                                  @RequestBody Map<String, String> body,
                                                  Authentication auth) {
        UUID authorId = UUID.fromString((String) auth.getPrincipal());
        String content = body.get("content");
        String parentId = body.get("parent_id");
        return ResponseEntity.ok(commentService.createComment(postId, authorId, content, parentId));
    }
}
```

### 3.6.5 SearchController

```java
// backend/src/main/java/com/blog/controller/SearchController.java
// [Spring MVC] 搜索控制器 — 基于 PostgreSQL 全文搜索
package com.blog.controller;

import com.blog.dto.response.PageResponse;
import com.blog.service.PostService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final PostService postService;

    public SearchController(PostService postService) {
        this.postService = postService;
    }

    // [GET] 全文搜索文章 — 使用 PostgreSQL tsvector 全文搜索
    @GetMapping
    public ResponseEntity<PageResponse<Map<String, Object>>> searchPosts(
            @RequestParam("q") String query,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(value = "page_size", defaultValue = "20") int pageSize) {
        return ResponseEntity.ok(postService.searchPosts(query, page, pageSize));
    }
}
```

---

## 3.7 请求日志拦截器与验证

### 3.7.1 WebConfig 请求日志

```java
// backend/src/main/java/com/blog/config/WebConfig.java
// [Spring] Web 配置 — 注册请求日志拦截器
package com.blog.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new RequestLogInterceptor());
    }

    private static class RequestLogInterceptor implements HandlerInterceptor {
        private static final Logger log = LoggerFactory.getLogger(RequestLogInterceptor.class);

        @Override
        public boolean preHandle(HttpServletRequest request,
                                 HttpServletResponse response, Object handler) {
            request.setAttribute("startTime", System.currentTimeMillis());
            log.info("-> {} {} from {}", request.getMethod(), request.getRequestURI(), request.getRemoteAddr());
            return true;
        }

        @Override
        public void afterCompletion(HttpServletRequest request,
                                    HttpServletResponse response,
                                    Object handler, Exception ex) {
            long start = (Long) request.getAttribute("startTime");
            long ms = System.currentTimeMillis() - start;
            log.info("<- {} {} {}ms {}", request.getMethod(), request.getRequestURI(), ms, response.getStatus());
        }
    }
}
```

### 3.7.2 验证文章与评论接口

重启应用（Flyway 自动执行 V002/V003），先登录获取 Token，再验证：

```powershell
# 0. 登录获取 Token（使用 Part 2 创建的用户 alice）
$loginBody = @{email='alice@example.com'; password='password123'} | ConvertTo-Json
$authResp = Invoke-RestMethod -Uri http://localhost:8080/api/auth/login -Method POST -ContentType 'application/json' -Body $loginBody
$token = $authResp.access_token

# 1. 创建文章（需登录）
$body = @{title='Hello Spring Boot'; content='My first post about spring boot'; status='published'; tags=@('java','spring')} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8080/api/posts -Method POST -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body $body
# 期望: 返回文章 JSON（记下 id，如 41d7930b-6537-4b68-a81e-c15b6215d9de）

# 2. 分页列表（公开接口，无需 Token）
Invoke-RestMethod -Uri 'http://localhost:8080/api/posts?page=1&page_size=10'
# 期望: {items=[...], page=1, page_size=10, total=1, has_more=False}

# 3. 全文搜索（公开接口）
Invoke-RestMethod -Uri 'http://localhost:8080/api/search?q=spring'

# 4. 发表评论（需登录，将 <POST_ID> 替换为第 1 步返回的文章 id）
$postId = '<POST_ID>'  # 例如: $postId = '41d7930b-6537-4b68-a81e-c15b6215d9de'
$commentBody = @{content='Nice post!'} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/api/posts/$postId/comments" -Method POST -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body $commentBody

# 5. 查看评论树（公开接口）
Invoke-RestMethod -Uri "http://localhost:8080/api/posts/$postId/comments"
```

> **下一步**：Part 4 开发实时聊天。聊天消息和房间同样需要持久化，
> 届时才会创建 chat_rooms / chat_messages / user_rooms 三张表及对应实体，
> 并引入 WebSocket 依赖。
