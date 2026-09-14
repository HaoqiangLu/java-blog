package com.blog.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.concurrent.TimeUnit;

@Component
public class JwtTokenProvider {
    private final SecretKey key;
    private final long expirationMs;
    private final long refreshExpirationMs;
    private final StringRedisTemplate redisTemplate;

    public JwtTokenProvider(@Value("${app.jwt.secret}") String secret,
                            @Value("${app.jwt.expiration}") long expirationSec,
                            @Value("${app.jwt.refresh-expiration}") long refreshExpirationSec,
                            StringRedisTemplate redisTemplate) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationSec * 1000;
        this.refreshExpirationMs = refreshExpirationSec * 1000;
        this.redisTemplate = redisTemplate;
    }

    public String generateAccessToken(String userId, String username, String email) {
        return Jwts.builder()
                .subject(userId)                    // 主体：这张卡是谁的
                .claim("username", username)    // 附加信息
                .claim("email", email)
                .issuedAt(new Date())               // 签发时间
                .expiration(new Date(System.currentTimeMillis() + expirationMs))    // 过期时间
                .signWith(key)                      // 用密钥签名
                .compact();
    }

    public String generateRefreshToken(String userId) {
        return Jwts.builder()
                .subject(userId)
                .claim("type", "refresh")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + refreshExpirationMs))
                .signWith(key)
                .compact();
    }

    public Claims validateToken(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean isTokenValid(String token) {
        try {
            if (isBlacklisted(token)) return false; // 先看是不是被拉黑了（登出的）
            validateToken(token);                   // 再验签名和过期时间
            return true;
        } catch (JwtException e) {
            return false;                           // 签名不对 / 过期 → 无效
        }
    }

    public void blacklistToken(String token) {
        try {
            Claims claims = validateToken(token);
            long remaining = claims.getExpiration().getTime() - System.currentTimeMillis(); // 还剩多久过期
            if (remaining > 0) {
                // [Redis] 黑名单 Token，TTL = 剩余有效时间
                // 把这个 token 存进 Redis，存活时间 = 它剩余的有效期
                redisTemplate.opsForValue().set(
                        "session:" + token, "blacklisted",
                        remaining, TimeUnit.MILLISECONDS);
            }
        } catch (JwtException ignored) {}
    }

    private boolean isBlacklisted(String token) {
        return Boolean.TRUE.equals(redisTemplate.hasKey("session:" + token));
    }
}
