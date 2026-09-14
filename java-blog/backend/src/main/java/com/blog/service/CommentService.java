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
        List<Comment> topLevel = commentRepository.findByPostIdAndParentIdIsNullOrderByCreatedAtAsc(postId);
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
