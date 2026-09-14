package com.blog.config;

import com.blog.security.JwtAuthenticationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtFilter;

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthenticationFilter jwtFilter) {
        this.jwtFilter = jwtFilter;
    }

    /*
     * permitAll() / authenticated() : 声明哪些接口放行、哪些必须登录
     * addFilterBefore(...) : 把我们自定义的 JWT 过滤器插进 Spring Security 的过滤器链
     * STATELESS : 服务器不保存任何会话，每次请求全靠 token 自证身份（这正是 JWT 方案的核心）
     */
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        // 允许前端跨域访问
        http.cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())   // 关掉 CSRF（因为用 JWT，不用 Cookie/Session）
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)) // 不存 session
                .authorizeHttpRequests(auth -> auth.requestMatchers(
                                            "/api/auth/login",
                                            "/api/auth/register",
                                            "/api/auth/refresh",
                                            "/api/health"
                                        ).permitAll()   // 这几个接口谁都能访问（登录/注册前本来就没凭证）
                                        .requestMatchers("/ws/**").permitAll()
                                        .requestMatchers("/api/posts/my-posts").authenticated()
                                        .requestMatchers(HttpMethod.GET, "/api/posts/**").permitAll()
                                        .requestMatchers(HttpMethod.GET, "/api/search/**").permitAll()
                                        .requestMatchers(HttpMethod.GET, "/api/ai/providers").permitAll()
                                        .anyRequest().authenticated())  // 其他所有接口都必须带有效凭证
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);    // 把我们的过滤器插进链里

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "Authorization"));
        config.setAllowCredentials(true);
        config.setMaxAge(86400L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
