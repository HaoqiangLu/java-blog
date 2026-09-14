package com.blog.websocket;

import com.blog.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Component
public class WebSocketAuthInterceptor implements HandshakeInterceptor {

    private final JwtTokenProvider tokenProvider;

    public WebSocketAuthInterceptor(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request,
                                   ServerHttpResponse response,
                                   WebSocketHandler wsHandler,
                                   Map<String, Object> attributes
    ) throws Exception {
        // [WebSocket] 从 URL 参数 ?token=xxx 提取 JWT
        if (request instanceof ServletServerHttpRequest servletRequest) {
            String token = servletRequest.getServletRequest().getParameter("token");
            if (token != null && tokenProvider.isTokenValid(token)) {
                Claims claims = tokenProvider.validateToken(token);
                attributes.put("userId", claims.getSubject());
                attributes.put("username", claims.get("username", String.class));
                return true;
            }
        }

        return false;   // 认证失败，拒绝握手
    }

    @Override
    public void afterHandshake(ServerHttpRequest request,
                               ServerHttpResponse response,
                               WebSocketHandler wsHandler,
                               Exception exception
    ) {
        // 握手完成后无需额外操作
    }
}
