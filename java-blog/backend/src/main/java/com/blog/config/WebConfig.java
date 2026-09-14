package com.blog.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new RequestLogInterceptor());
    }

    private static class RequestLogInterceptor implements HandlerInterceptor {
        private static final Logger log = LoggerFactory.getLogger(RequestLogInterceptor.class);

        @Override
        public boolean preHandle(
                HttpServletRequest request,
                HttpServletResponse response,
                Object handler
        ) {
            request.setAttribute("startTime", System.currentTimeMillis());
            log.info("-> {} {} from {}", request.getMethod(), request.getRequestURI(), request.getRemoteAddr());
            return true;
        }

        @Override
        public void afterCompletion(
                HttpServletRequest request,
                HttpServletResponse response,
                Object handler,
                Exception ex
        ) {
            long start = (Long) request.getAttribute("startTime");
            long ms = System.currentTimeMillis() - start;
            log.info("<- {} {} {}ms {}", request.getMethod(), request.getRequestURI(), ms, response.getStatus());
        }
    }
}
