package com.blog.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class CreatePostRequest {

    @NotBlank @Size(max = 500)
    private String title;

    private String content;
    private String summary;
    private String coverImage;
    private List<String> tags;
    private String status;  // "draft" or "published"
}
