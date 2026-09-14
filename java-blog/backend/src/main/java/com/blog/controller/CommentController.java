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
    public ResponseEntity<Comment> createComment(
            @PathVariable UUID postId,
            @RequestBody Map<String, String> body,
            Authentication auth
    ) {
        UUID authorId = UUID.fromString((String) auth.getPrincipal());
        String content = body.get("content");
        String parentId = body.get("parent_id");
        return ResponseEntity.ok(commentService.createComment(postId, authorId, content, parentId));
    }
}
