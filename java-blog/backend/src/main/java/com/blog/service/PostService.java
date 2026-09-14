package com.blog.service;

import com.blog.dto.request.CreatePostRequest;
import com.blog.dto.response.PageResponse;
import com.blog.exception.BusinessException;
import com.blog.model.Post;
import com.blog.repository.PostRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
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
        return postRepository.findById(id).orElseThrow(
                () -> new BusinessException(404, "Post not found")
        );
    }

    public PageResponse<Map<String, Object>> listPosts(String status, int page, int pageSize) {
        /*
         * PageRequest.of(page-1, pageSize, Sort) :
         *      [Spring Data]
         *      把「第几页、每页多大、怎么排序」封装成一个对象。注意 page 从 0 开始，所以前端传 1 要减 1
         */
        Pageable pageable = PageRequest.of(page - 1, pageSize, Sort.by("createdAt").descending());
        /*
         * Page<Post> : [Spring Data]
         *      查询结果不只是一个 List，还附带 getTotalElements()（总数）、hasNext()（有没有下一页）等元信息
         */
        Page<Post> postPage = postRepository.findByStatus(status, pageable);

        List<Map<String, Object>> content = postPage.getContent().stream().map(this::toListMap).toList();

        return PageResponse.<Map<String, Object>>builder()
                .content(content)
                .page(page)
                .pageSize(pageSize)
                .total(postPage.getTotalElements())
                .hasMore(postPage.hasNext())
                .build();
    }

    // 按作者查询 — Home 页面展示当前用户的所有文章（不限状态）
    public PageResponse<Map<String, Object>> listPostsByAuthor(UUID authorId, int page, int pageSize) {
        Pageable pageable = PageRequest.of(page - 1, pageSize, Sort.by("updatedAt").descending());
        Page<Post> postPage = postRepository.findByAuthorId(authorId, pageable);

        List<Map<String, Object>> content = postPage.getContent().stream().map(this::toListMap).toList();

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
        if (request.getContent() != null) {
            post.setContent(request.getContent());
        }
        if (request.getSummary() != null) {
            post.setSummary(request.getSummary());
        }
        if (request.getCoverImage() != null) {
            post.setCoverImage(request.getCoverImage());
        }
        if (request.getTags() != null) {
            post.setTags(request.getTags());
        }
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
                .map(this::toListMap).toList();

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
