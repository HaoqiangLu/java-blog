package com.blog.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;

@Component
public class RateLimitFilter implements Filter {

    private final StringRedisTemplate redisTemplate;

    // 限流配置：每分钟 60 次请求
    private static final int MAX_REQUESTS = 60;
    private static final int WINDOW_SECONDS = 60;

    public RateLimitFilter(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
    throws IOException, ServletException {
        HttpServletRequest httpReq = (HttpServletRequest) request;
        String key = "rate:" + httpReq.getRemoteAddr() + ":" + httpReq.getRequestURI();

        // [Redis] 原子操作：首次访问时 SETNX + TTL 同时设置，避免竞态条件
//        redisTemplate.opsForValue().setIfAbsent(key, "0", Duration.ofSeconds(WINDOW_SECONDS));
//        Long count = redisTemplate.opsForValue().increment(key);

        if (!slidingWindowAllow(key, MAX_REQUESTS, WINDOW_SECONDS)) {
            HttpServletResponse httpResp = (HttpServletResponse) response;
            httpResp.setStatus(429);
            httpResp.setHeader("Retry-After", String.valueOf(WINDOW_SECONDS));
            httpResp.getWriter().write("{\"error\":\"Too many requests\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    // [Redis] 滑动窗口：Sorted Set 按时间戳计数，返回 true 表示放行
    private boolean slidingWindowAllow(String key, int maxRequests, int windowSeconds) {
        long now = System.currentTimeMillis();
        long windowStart = now - windowSeconds * 1000L;

        // 1. 移除窗口外的旧记录
        redisTemplate.opsForZSet().removeRangeByScore(key, 0, windowStart);

        // 2. 先统计再决定是否写入：超限直接拒，被拒请求不进 ZSET，避免污染计数
        Long count = redisTemplate.opsForZSet().zCard(key);
        if (count != null && count >= maxRequests) {
            return false;
        }

        // 3. 记录本次请求：member 用「时间戳:随机数」保证唯一，score 为当前时间戳
        redisTemplate.opsForZSet().add(key, now + ":" + Math.random(), now);

        // 4. 让 key 在窗口结束后自动过期，避免冷 key 长期堆积
        redisTemplate.expire(key, Duration.ofSeconds(windowSeconds));
        return true;
    }
}
