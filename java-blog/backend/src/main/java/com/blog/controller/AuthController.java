package com.blog.controller;

import com.blog.dto.request.LoginRequest;
import com.blog.dto.request.RegisterRequest;
import com.blog.dto.response.AuthResponse;
import com.blog.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController                    // 告诉 Spring：这个类是用来接 HTTP 请求的，返回值直接写成 JSON
@RequestMapping("/api/auth")    // 这个类里所有接口的公共前缀
public class AuthController {

    private final AuthService authService;

    // 构造器注入：Spring 自动把 AuthService 对象塞进来
    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")   // 前缀 + 这里 = POST /api/auth/register
    /*
     * @Valid : [Bean Validation] 触发参数校验
     * @RequestBody : [Spring MVC + Jackson] 触发 JSON → 对象 的转换
     */
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest request){
        return ResponseEntity.ok(authService.register(request));    // 活儿交给 Service，自己只负责收发
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(@RequestHeader("Authorization") String auth) {
        String token = auth.replace("Bearer ", "");
        authService.logout(token);
        return ResponseEntity.ok(Map.of("message", "Logged out"));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.refreshToken(body.get("refresh_token")));
    }
}
