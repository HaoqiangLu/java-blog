package com.blog.repository;

import com.blog.model.Post;
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
public interface PostRepository extends JpaRepository<Post, UUID> {

    Optional<Post> findBySlug(String slug);

    Page<Post> findByStatus(String status, Pageable pageable);

    Page<Post> findByAuthorId(UUID authorId, Pageable pageable);

    // [PostgreSQL] 数组包含查询 — 查找包含指定标签的文章
    @Query(value = "SELECT * FROM posts WHERE :tag = ANY(tags) AND status = 'published'", nativeQuery = true)
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

    @Modifying
    @Transactional
    @Query("UPDATE Post p SET p.likeCount = p.likeCount + 1 WHERE p.id = :id")
    int incrementLikeCount(UUID id);

    long countByStatus(String status);
}
