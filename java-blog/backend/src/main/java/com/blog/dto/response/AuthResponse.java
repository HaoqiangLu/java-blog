package com.blog.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data @Builder
public class AuthResponse {
    // [Jackson] @JsonProperty 保证 JSON 输出为 snake_case，与前端 TypeScript 类型定义一致
    @JsonProperty("access_token")
    private String accessToken;

    @JsonProperty("refresh_token")
    private String refreshToken;

    @JsonProperty("token_type")
    private String tokenType;

    @JsonProperty("expires_in")
    private long expiresIn;

    private Map<String, Object> user;
}
