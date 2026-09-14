package com.blog.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data @Builder
public class PageResponse<T> {
    /*
     * @JsonProperty("items") : Jackson 序列化时把 Java 字段名 content 映射成 JSON 键名 items，保证前后端字段名一致
     */
    @JsonProperty("items")
    private List<T> content;    // Java 字段叫 content，JSON 输出叫 items

    private int page;

    @JsonProperty("page_size")
    private int pageSize;       // JSON 输出叫 page_size（snake_case）

    private long total;

    @JsonProperty("has_more")
    private boolean hasMore;    // JSON 输出叫 has_more
}
