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
