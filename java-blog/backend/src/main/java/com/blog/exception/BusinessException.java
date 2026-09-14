package com.blog.exception;

import lombok.Getter;

// 自定义业务异常：带一个状态码
@Getter
public class BusinessException extends RuntimeException {

    private final int statusCode;

    public BusinessException(int statusCode, String message) {
        super(message);
        this.statusCode = statusCode;
    }
}
