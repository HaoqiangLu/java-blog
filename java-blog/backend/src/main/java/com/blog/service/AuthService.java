package com.blog.service;

import com.blog.dto.request.LoginRequest;
import com.blog.dto.request.RegisterRequest;
import com.blog.dto.response.AuthResponse;
import com.blog.exception.BusinessException;
import com.blog.model.User;
import com.blog.repository.UserRepository;
import com.blog.security.JwtTokenProvider;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/*
 * @Service : [Spring 容器] 标记业务类，让 Spring 创建并管理它的实例（一个 Bean）
 */
@Service    // 告诉 Spring：这是个业务逻辑类，帮我管理它的实例
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
    }

    /*
     * @Transactional : [Spring 事务] 把整个方法包进一个数据库事务：中途抛异常，已做的数据库操作全部回滚
     * passwordEncoder.encode(...) : [Spring Security] 把明文密码用 BCrypt 加密成密文再存，数据库里永远看不到明文
     * User.builder()...build() : [Lombok @Builder] 链式创建对象，比一堆 setXxx() 好读
     * userRepository.save(...) : [Spring Data JPA] 把这个 User 存进数据库
     */
    @Transactional  // 要么全部成功，要么全部回滚
    public Map<String, Object> register(RegisterRequest request) {
        // ① 查重：用户名已存在就抛 409
        if (userRepository.findByUsernameAndStatusNot(request.getUsername(), "deleted").isPresent()) {
            throw new BusinessException(409, "Username taken");
        }

        // ① 查重：邮箱已存在就抛 409
        if (userRepository.findByEmailAndStatusNot(request.getEmail(), "deleted").isPresent()) {
            throw new BusinessException(409, "Email registered");
        }

        // ② 加密密码 + 组装 User 对象（用 Builder 链式写法）
        User user = User.builder()
                .username(request.getUsername())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))    // 明文 → 密文
                .status("active")
                .bio("")
                .build();
        // ③ 存库
        user = userRepository.save(user);

        return Map.of("message", "Registered", "user_id", user.getId());
    }

    public AuthResponse login(LoginRequest request) {
        // ① 按邮箱查用户，查不到就抛 401
        User user = userRepository.findByEmailAndStatusNot(request.getEmail(), "deleted")
                .orElseThrow(() -> new BusinessException(401, "Invalid email or password"));

        // ② 比对密码：matches(明文, 数据库里的密文)
        /*
         * passwordEncoder.matches(明文, 密文) : 验证密码。注意它不是「解密」，而是把明文用同样的盐再算一遍，比对结果是否一致
         */
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BusinessException(401, "Invalid email or password");
        }

        // ③ 发两张凭证
        String accessToken = tokenProvider.generateAccessToken(
                user.getId().toString(), user.getUsername(), user.getEmail());
        String refreshToken = tokenProvider.generateRefreshToken(user.getId().toString());

        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", user.getId());
        userMap.put("username", user.getUsername());
        userMap.put("email", user.getEmail());
        userMap.put("displayName", user.getDisplayName());
        userMap.put("avatarUrl", user.getAvatarUrl());
        userMap.put("bio", user.getBio());
        userMap.put("status", user.getStatus());

        // ④ 组装响应返回
        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(3600)
                .user(userMap)
                .build();
    }

    public void logout(String token) {
        tokenProvider.blacklistToken(token);
    }

    public AuthResponse refreshToken(String refreshToken) {
        if (!tokenProvider.isTokenValid(refreshToken)) {
            throw new BusinessException(401, "Invalid refresh token");
        }
        var claims = tokenProvider.validateToken(refreshToken);
        String userId = claims.getSubject();

        User user = userRepository.findByIdAndStatusNot(UUID.fromString(userId), "deleted")
                .orElseThrow(() -> new BusinessException(401, "User not found"));

        String newAccess = tokenProvider.generateAccessToken(
                user.getId().toString(), user.getUsername(), user.getEmail());
        String newRefresh = tokenProvider.generateRefreshToken(user.getId().toString());

        return AuthResponse.builder()
                .accessToken(newAccess)
                .refreshToken(newRefresh)
                .tokenType("Bearer")
                .expiresIn(3600)
                .build();
    }
}
