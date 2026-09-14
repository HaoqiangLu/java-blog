# IntelliJ IDEA 项目配置详解

本文档集中呈现本项目在 IntelliJ IDEA 中的配置要点，包括 JDK 设置、Maven 配置、Spring Boot 运行、代码风格及调试技巧。

前置条件：已按 Part 1（1.1 节）安装 JDK 25 和 Maven。

---

## 1. IDEA 项目初始化

### 1.1 导入 Maven 项目

1. 打开 IDEA → **File → Open** → 选择项目根目录 `java-blog/`
2. IDEA 自动检测到 `pom.xml`，弹出提示选择 **Open as Project**
3. 等待 Maven 依赖下载完成（右下角进度条）

### 1.2 JDK 配置

| 设置项 | 路径 | 值 |
|--------|------|-----|
| Project SDK | File → Project Structure → Project | JDK 25 |
| Project language level | 同上 | 25 |
| Module SDK | File → Project Structure → Modules | Project SDK |
| Java Compiler | Settings → Build → Compiler → Java Compiler | Target bytecode version: 25 |

### 1.3 Maven 配置

| 设置项 | 路径 | 值 |
|--------|------|-----|
| Maven home path | Settings → Build → Maven | 系统 Maven 或 Bundled (Maven 3.9+) |
| User settings file | 同上 | 自动检测 `~/.m2/settings.xml` |
| Local repository | 同上 | 默认 `~/.m2/repository` |
| Import Maven projects automatically | Settings → Build → Maven → Importing | 勾选 |

---

## 2. Spring Boot 运行配置

### 2.1 运行/调试配置

IDEA Ultimate 内置 Spring Boot 支持：

1. **Run → Edit Configurations → + → Spring Boot**
2. 配置项：

| 字段 | 值 |
|------|-----|
| Name | BlogApplication |
| Main class | `com.blog.Application`（自动检测） |
| Active profiles | `dev`（开发环境） |
| VM options | `-Xms256m -Xmx512m`（可选，限制内存） |
| Environment variables | 从 `.env` 文件加载或手动配置 |

### 2.2 使用 Maven 运行（Community 版）

IDEA Community 没有 Spring Boot 专用配置，使用 Maven 运行：

```
Maven 面板 → blog-backend → Plugins → spring-boot → spring-boot:run
```

或使用 Application 配置：

1. **Run → Edit Configurations → + → Application**
2. Main class: `com.blog.Application`
3. Module classpath: `blog-backend`

---

## 3. 代码风格与格式化

### 3.1 Google Java Style（推荐）

本项目建议遵循 Google Java Style Guide，可选择在 `pom.xml` 中添加以下插件自动格式化：

```xml
<!-- 可选：在 pom.xml <build><plugins> 中添加 -->
<plugin>
    <groupId>com.spotify.fmt</groupId>
    <artifactId>fmt-maven-plugin</artifactId>
    <version>2.23</version>
</plugin>
```

IDEA 中手动格式化：`Ctrl + Alt + L`（遵循 IDEA 内置 Google Style 方案）。

### 3.2 导入 Google Java Style 到 IDEA

1. 安装插件：**Settings → Plugins** → 搜索 **Google Java Format**
2. 启用：**Settings → Other Settings → google-java-format Settings** → 勾选 **Enable**
3. 设置 **Format on save** 可选

---

## 4. 实用插件推荐

| 插件 | 功能 |
|------|------|
| Lombok | 支持 `@Data`、`@Builder` 等注解（需同时开启 Annotation Processing） |
| Spring Boot Assistant | application.yml 配置项智能提示 |
| JPA Buddy | JPA Entity 可视化编辑、DDL 生成、Spring Data JPA 导航 |
| Database Navigator | 内置数据库浏览（或使用 DataGrip） |
| .ignore | Git 忽略规则管理 |
| Rainbow Brackets | 彩色括号匹配，提升可读性 |

### 4.1 开启 Lombok 注解处理

**Settings → Build → Compiler → Annotation Processors → Enable annotation processing**

---

## 5. 调试技巧

### 5.1 热部署（DevTools）

项目已引入 `spring-boot-devtools`，修改代码后自动重启：

- **Build → Build Project**（`Ctrl + F9`）触发自动重启
- 仅支持方法体内部修改、配置文件变更；新增类/方法需手动重启

### 5.2 条件断点

右键断点 → 输入条件表达式：

```java
// 仅在 userId 为特定值时中断
userId.equals("test-user-id")
```

### 5.3 日志断点（不暂停执行）

右键断点 → 取消勾选 **Suspend** → 在 **Log message** 输入：

```
变量值: {variableName}
```

### 5.4 数据库调试

使用 IDEA 内置 Database 工具：

1. **Database → + → Data Source → PostgreSQL**
2. 连接配置：`localhost:5432/blogdb`，用户 `bloguser`
3. 可直接在 IDE 内执行 SQL、查看表结构

---

## 6. 版本控制集成

### 6.1 Git 配置

1. **Settings → Version Control → Git** → 指定 `git.exe` 路径
2. **Settings → Version Control → GitHub** → 添加 GitHub 账号（可选）

### 6.2 常用操作

| 操作 | 快捷键 |
|------|--------|
| Commit | `Ctrl + K` |
| Push | `Ctrl + Shift + K` |
| Update (Pull) | `Ctrl + T` |
| Show History | 右键文件 → Git → Show History |
| Annotate | 右键文件 → Annotate（查看每行最后修改） |

---

## 7. 终端与构建

IDEA 内置终端可直接使用 Maven 命令：

```bash
# 编译
mvn compile

# 运行测试
mvn test

# 打包
mvn package -DskipTests

# 运行
mvn spring-boot:run
```

或使用 IDEA Maven 面板（右侧边栏）执行对应目标。
