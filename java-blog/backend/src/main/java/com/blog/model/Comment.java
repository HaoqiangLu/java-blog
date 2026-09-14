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
