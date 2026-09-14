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
