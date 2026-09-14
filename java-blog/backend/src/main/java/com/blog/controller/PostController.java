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

    /*
     * @RequestParam(value = "page_size") : [Spring MVC]
     *      前端传 snake_case 的 page_size，Java 变量用 camelCase 的 pageSize，这个注解做桥梁
     */
    @GetMapping
    public ResponseEntity<PageResponse<Map<String, Object>>> listPosts(
            @RequestParam(defaultValue = "published") String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(value = "page_size", defaultValue = "20") int pageSize
    ) {
        return ResponseEntity.ok(postService.listPosts(status, page, pageSize));
    }

    // 当前用户的所有文章（不限状态）— Home 页面使用
    @GetMapping("/my-posts")
    public ResponseEntity<PageResponse<Map<String, Object>>> myPosts(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(value = "page_size", defaultValue = "20") int pageSize,
            Authentication auth
    ) {
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
    public ResponseEntity<Post> createPost(@Valid @RequestBody CreatePostRequest request, Authentication auth) {
        UUID userId = UUID.fromString((String) auth.getPrincipal());
        return ResponseEntity.ok(postService.createPost(userId, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Post> updatePost(
            @PathVariable UUID id,
            @Valid @RequestBody CreatePostRequest request,
            Authentication auth
    ) {
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
