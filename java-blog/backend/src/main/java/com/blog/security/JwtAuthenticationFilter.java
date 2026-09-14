package com.blog.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

/*
 * OncePerRequestFilter : Spring 提供的基类，保证一个请求只被这个过滤器处理一次
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter { // 保证每个请求只过一次

    private final JwtTokenProvider tokenProvider;

    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {
        String token = extractToken(request);   // 从请求头 Authorization: Bearer xxx 里取出 token

        if (token != null && tokenProvider.isTokenValid(token)) {
            Claims claims = tokenProvider.validateToken(token);
            String userId = claims.getSubject();    // 解出这是谁
            String username = claims.get("username", String.class);

            // [Spring Security] 将用户信息注入 SecurityContext
            // 把「当前是谁」放进 SecurityContext，后续代码就能取到
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(userId, null, Collections.emptyList());
            auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            /*
             * SecurityContextHolder : 一个「当前请求是谁」的存放处（基于 ThreadLocal），业务代码里随时能取
             */
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        filterChain.doFilter(request, response);    // 无论验没验过，都放行到下一站（该拦的后面拦）
    }

    private String extractToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (bearer != null && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        return null;
    }
}
