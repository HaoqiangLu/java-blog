package com.blog.exception;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.stream.Collectors;

/*
 * @RestControllerAdvice : [Spring MVC] 一个{全局异常拦截器}，所有 Controller 抛的异常都先经过它
 */
@RestControllerAdvice   // 全局异常处理器：所有 Controller 抛的异常都先到这里
public class GlobalExceptionHandler {

    /*
     * @ExceptionHandler(X.class) : [Spring MVC] 声明{我负责处理 X 类型的异常}
     * ResponseEntity : [Spring MVC] 能同时控制响应的状态码和响应体
     */
    @ExceptionHandler(BusinessException.class)  // 专门接 BusinessException
    public ResponseEntity<Map<String, String>> handleBusiness(BusinessException ex) {
        return ResponseEntity.status(ex.getStatusCode())    // 用它自带的状态码，比如 409
                .body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)    // 专门接 @Valid 校验失败
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        // 把每个字段的错误信息收集成一个 map
        Map<String, String> fieldErrors = ex.getBindingResult().getFieldErrors().stream().collect(
                                            Collectors.toMap(
                                                    fe -> fe.getField(),
                                                    fe -> fe.getDefaultMessage(),
                                                    (a, b) -> a
                                            ));
        return ResponseEntity.badRequest().body(    // 400
                Map.of("error", "Validation failed", "details", fieldErrors));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGeneral(Exception ex) {
        return ResponseEntity.internalServerError()
                .body(Map.of("error", "Internal server error"));
    }
}
