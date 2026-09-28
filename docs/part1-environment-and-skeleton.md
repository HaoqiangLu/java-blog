# Part 1：环境搭建与项目骨架

> **本章目标**：装好开发工具，用 HelloWorld 验证环境可用，再创建一个**能启动、有健康检查接口**的最小 Spring Boot 骨架。
> 数据库、Redis、前端、安全等内容**本章一律不引入**——等后续章节真正写代码需要时再逐步补充，这也是本教程的整体思路：像真实开发一样，用到什么才引入什么。

---

## 1.1 JDK 25 + Maven 环境配置

> 本项目使用 **JDK 25 (LTS)** 和 **Apache Maven 3.9+** 作为后端开发与构建工具。
> 以下命令基于 **Windows** 环境，使用 PowerShell。

### 1.1.1 JDK 25 安装

```powershell
# 从 Oracle 下载 JDK 25: https://www.oracle.com/java/technologies/downloads
# 下载 Windows x64 MSI 安装包，运行安装程序
# 安装完成后手动配置环境变量：
# 1. 新建系统变量 JAVA_HOME = D:\Tools\JavaDev\jdk25（你的实际安装路径）
# 2. 编辑系统变量 PATH，新增一条 %JAVA_HOME%\bin

# 验证安装
java --version      # 期望: java version "25.x.x"
javac --version     # 期望: javac 25.x.x
```

### 1.1.2 Maven 安装

```powershell
# 从 https://maven.apache.org/download.cgi 下载 Binary zip
# 解压到 D:\Tools\JavaDev\maven\apache-maven-3.9.16
# 配置环境变量：
# 1. 新建系统变量 M2_HOME = D:\Tools\JavaDev\maven\apache-maven-3.9.16
# 2. 编辑系统变量 PATH，新增一条 %M2_HOME%\bin

# 验证安装
mvn --version       # 期望: Apache Maven 3.9+
```

### 1.1.3 Git

```powershell
# 从 https://git-scm.com/download/win 下载安装程序
# 运行安装程序，保持默认选项即可

git --version       # 期望: 2.x.x
```

---

## 1.2 Node.js 24 + pnpm

```powershell
# [Node.js] JavaScript 运行时，用于前端 Vite 构建工具运行
# 从 https://nodejs.org/ 下载 LTS 版本 (v24.x) 安装包，运行安装程序

node --version   # 期望: v24.x.x

# [pnpm] 高性能 Node.js 包管理器
npm install -g pnpm@latest

pnpm --version   # 期望: 11.x.x+
```

> **说明**：Node.js 和 pnpm 属于一次性装好的基础工具，提前安装即可。
> 前端项目的实际初始化推迟到 Part 5 真正开始写前端时进行。

---

## 1.3 Docker Desktop

```powershell
# [Docker] 容器化平台，用于打包应用及其依赖为独立容器
# 从 https://www.docker.com/products/docker-desktop/ 下载安装 Docker Desktop
# 安装后重启系统

docker --version
docker compose version
```

> **说明**：本章只安装 Docker，**先不启动任何容器**。
> PostgreSQL 容器在 Part 2 开发用户认证、首次需要数据库时启动；
> Redis 容器同样在 Part 2 需要 JWT 黑名单时启动。

---

## 1.4 当前阶段项目结构

> **说明**：下面是完成本章后项目的**实际结构**，只有骨架文件。
> 后续每个 Part 用到什么就创建什么，不要提前创建。

```
blog-project/
├── docs/                              # 项目文档（本系列教程文档）
└── java-blog/
    ├── .idea/                         # IDEA 项目配置（自动生成，不提交）
    └── backend/                       # Java 后端（Spring Boot）
        ├── pom.xml                    # Maven 构建配置（当前仅 Web 骨架依赖）
        ├── .gitignore                 # IDEA 向导自动生成
        ├── .mvn/                      # Maven Wrapper 配置（IDEA 自动生成）
        ├── target/                    # 编译产物（自动生成，已被 .gitignore 忽略）
        └── src/
            └── main/
                ├── java/com/blog/         # 后端源码根目录
                │   ├── Application.java   # Spring Boot 启动入口
                │   └── controller/
                │       └── HealthController.java   # 健康检查接口
                └── resources/
                    └── application.yml    # 主配置文件（最小配置）
```

---

## 1.5 使用 IntelliJ IDEA 创建 Maven 项目

> **说明**：本节使用 IntelliJ IDEA 的 **New Project** 向导创建后端 Maven 项目骨架，
> 替代手动编写 `pom.xml`。IDE 配置详见 `docs/idea-configuration.md`。

### 1.5.1 IntelliJ New Project 向导配置

打开 IntelliJ IDEA，点击 **File → New → Project**，按以下参数填写：

| 字段 | 值 |
|---|---|
| **Name** | `backend` |
| **Location** | `D:\Program\Java\blog-project\java-blog\backend` |
| **Build system** | `Maven` |
| **JDK** | `Oracle OpenJDK 25.0.4`（选择已安装的 JDK 25） |
| **Add sample code** | ☐ 取消勾选 |

> **说明**：Location 中若 `java-blog/` 等父目录尚不存在，IDEA 会在创建项目时自动生成，无需手动建目录。

点击 **Create**，IDEA 会自动生成基础 Maven 项目结构：

```
java-blog/backend/
├── pom.xml                    # IDEA 生成的基础 POM
├── .gitignore                 # 向导自动生成（内容见 1.8 节）
├── .mvn/                      # Maven Wrapper 配置
└── src/
    ├── main/
    │   ├── java/              # 源码目录（空）
    │   └── resources/         # 资源目录（空）
    └── test/
        └── java/              # 测试目录（空）
```

### 1.5.2 HelloWorld 环境验证

> **说明**：正式开始项目前，先在新建的项目里跑一个最简单的 HelloWorld，
> 验证 JDK、Maven、IDEA 配置三者都工作正常——这是环境装好后的"试车"步骤，
> 此时**不要**动 `pom.xml`，用的还是 IDEA 生成的原始 POM。

在 IDEA 中创建包和类（**不要手动建文件夹**，Java 中应通过 IDEA 创建 package，IDEA 会自动处理目录结构）：

1. 在 Project 视图中选中 `backend/src/main/java` 目录 → 右键 → **New → Package**，输入包名 **`com.blog`**，回车
2. 右键刚创建的 `com.blog` 包 → **New → Java Class**，输入类名 **`HelloWorld`**，回车
3. 在生成的文件中填入以下代码（注意 `package` 声明必须与所在包名一致）：

```java
// backend/src/main/java/com/blog/HelloWorld.java
package com.blog;

public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello World —— JDK " + Runtime.version() + " 环境验证通过");
    }
}
```

> **约定**：后续所有章节创建 Java 类都按上述步骤操作——
> 文档代码块首行注释是目标文件的完整路径（如 `com/blog/controller/HealthController.java`
> 对应包 `com.blog.controller`），只需在 IDEA 中创建对应包和类即可，无需手动建目录。

**验证方式一：IDEA 内运行（验证 IDE 配置）**

点击 `main` 方法左侧绿色 ▶ → **Run 'HelloWorld.main()'**，控制台输出以下内容即说明 Project SDK、language level、编译器配置均正确：

```
Hello World —— JDK 25.0.4 环境验证通过
```

**验证方式二：命令行 Maven 编译运行（验证 Maven 配置）**

```powershell
cd D:\Program\Java\blog-project\java-blog\backend
mvn compile
java -cp target/classes com.blog.HelloWorld
# 期望输出: Hello World —— JDK 25.0.4 环境验证通过
```

> **说明**：验证通过后删除 `HelloWorld.java`，保持项目干净，后续不再使用。
> 若这一步报错，先对照 `docs/idea-configuration.md` 检查 JDK 与编译器配置，再继续往下走。

### 1.5.3 修改 pom.xml

> **说明**：将 IDEA 生成的 `backend/pom.xml` 内容**整体替换**为以下内容。
> 注意：这里**只包含骨架阶段真正用到的依赖**（Web + Lombok + DevTools），
> 数据库、安全、WebSocket 等依赖等到对应章节写代码需要时再添加。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <!-- [Spring Boot] 继承父 POM，统一管理 Spring 依赖版本。
         注意：3.4.x 官方仅支持到 Java 24，在 JDK 25 上执行 spring-boot:run 会报
         Unsupported class file major version 69（插件内置 ASM 读不懂 Java 25 字节码），必须用 3.5+ -->
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.5.12</version>
        <relativePath/>
    </parent>

    <groupId>com.blog</groupId>
    <artifactId>blog-backend</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    <name>Blog Platform Backend</name>

    <properties>
        <java.version>25</java.version>
        <!-- [Lombok] 覆盖 Spring Boot 默认版本：1.18.34 不支持 JDK 25，编译会报
             ExceptionInInitializerError: TypeTag :: UNKNOWN，必须用 1.18.40+ -->
        <lombok.version>1.18.46</lombok.version>
        <!-- [JWT] JSON Web Token 库（Part 2 实现认证时使用） -->
        <jjwt.version>0.12.6</jjwt.version>
    </properties>

    <dependencies>
        <!-- ===== Part 1 骨架所需依赖 ===== -->

        <!-- [Spring Boot Web] 内嵌 Tomcat + Spring MVC，提供 REST API 支持 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        <!-- [Lombok] 编译时注解处理器，自动生成 getter/setter/builder/构造器 -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- [Spring Boot DevTools] 开发时热部署，修改代码自动重启（仅开发环境） -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-devtools</artifactId>
            <scope>runtime</scope>
            <optional>true</optional>
        </dependency>

        <!-- 后续章节写代码用到时才添加（各章节有具体步骤）：
             Part 2: spring-boot-starter-validation          # DTO 参数校验
             Part 2: spring-boot-starter-data-jpa + postgresql + flyway  # 用户持久化
             Part 2: spring-boot-starter-security + jjwt     # 认证授权
             Part 2: spring-boot-starter-data-redis          # JWT 黑名单
             Part 4: spring-boot-starter-websocket           # 实时聊天
        -->
    </dependencies>

    <build>
        <plugins>
            <!-- [Maven] 编译器插件 — 显式声明 Lombok 注解处理器路径。
                 JDK 25 的模块系统更严格，编译器无法自动从 classpath 发现注解处理器，
                 必须通过 annotationProcessorPaths 显式指定，否则 @Getter/@Builder 等
                 Lombok 注解在编译时不会生成对应方法，导致大量 "找不到符号" 编译错误 -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <configuration>
                    <annotationProcessorPaths>
                        <path>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                            <version>${lombok.version}</version>
                        </path>
                    </annotationProcessorPaths>
                </configuration>
            </plugin>
            <!-- [Spring Boot] Maven 打包插件，生成可执行 fat JAR -->
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

> **说明**：替换后 IDEA 右下角通常会提示 "Maven projects need to be imported"，点击 **Reload** 或 **Import Changes** 让 IDEA 重新加载依赖。
> 若未出现提示（或 pom.xml 中出现红色波浪线报错，如 `spring-boot-starter-parent not found`），
> 打开右侧 **Maven 工具窗口**，点击工具栏最左侧的 **🔄 Sync/Reload All Maven Projects**（圆形箭头）按钮手动触发导入。
> 刚粘贴完 pom.xml 时的 "not found" 报错是 IDEA 尚未同步依赖的滞后提示，Reload 后即消失。
>
> 首次导入需下载 Spring Boot 相关依赖，视网络情况可能需要几分钟，等待底部进度条跑完即可。
>
> Spring Boot Parent POM 已统一管理所有 Spring 依赖版本，无需手动指定版本号。
>
> 版本选择说明：3.5 是 3.x 的最后一个次版本线，官方支持 Java 17–25；选用 3.5.12（该线最新补丁版）。
> 若误用 3.4.x，执行 `spring-boot:run`（IDEA Maven 面板或命令行）会报 `Unsupported class file major version 69`，
> 原因是插件内置的 ASM 库无法解析 Java 25 编译出的字节码（主版本号 69）。
>
> **`maven-compiler-plugin` 说明**：`<annotationProcessorPaths>` 显式告诉编译器去哪里找 Lombok 注解处理器。
> 没有这段配置，JDK 25 的编译器无法自动发现 Lombok，导致 `@Getter`、`@Builder`、`@Data` 等注解
> 在编译时不生效——所有 getter/setter/builder 方法都会报 "找不到符号" 错误。

---

## 1.6 Spring Boot 应用配置

> **说明**：在 IDEA 中右键 `src/main/resources` 目录 → **New → File**，输入文件名 **`application.yml`**（资源文件直接建文件即可，无需 package）。
> Spring Boot 使用 YAML 格式的配置文件。
> 本章只写最小配置——数据源、Redis、JWT 等配置随对应功能在 Part 2 引入。

```yaml
# backend/src/main/resources/application.yml
# [Spring Boot] 主配置文件 — 随功能开发逐步扩充（Part 2 会追加数据源/Redis/JWT 配置）

server:
  port: ${BACKEND_PORT:8080}

spring:
  application:
    name: blog-platform

# ---- 日志配置 ----
logging:
  level:
    root: INFO
    com.blog: DEBUG
    org.springframework.web: INFO
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n"
```

---

## 1.7 Spring Boot 主入口

> **说明**：创建 Spring Boot 启动类。按 1.5.2 的约定，在 `com.blog` 包（已存在）上右键 → **New → Java Class**，
> 类名输入 **`Application`**，填入以下代码。

```java
// backend/src/main/java/com/blog/Application.java
// [Spring Boot] 应用启动入口 — 运行 main 方法即可启动内嵌 Tomcat 并暴露 8080 端口
package com.blog;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// @SpringBootApplication：Spring Boot 的核心注解，相当于三个注解的合体：
//   1) 自动配置 — 根据 pom.xml 引入的依赖自动装配组件（如引入 web starter 就自动配好内嵌 Tomcat）
//   2) 组件扫描 — 自动发现 com.blog 包及子包下的 @RestController/@Service 等类并纳入管理
// @EnableScheduling：开启定时任务支持，后续可用 @Scheduled 定义周期性任务（如定时清理过期数据）
@SpringBootApplication
@EnableScheduling
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

> **说明**：`@` 开头的是 Java **注解（Annotation）**——给代码附加元信息的标记，框架在启动时读取它们来决定行为，类似配置文件但写在代码里。
> 若去掉 `@SpringBootApplication`，应用启动后不会自动装配任何组件，接口全部失效；它是 Spring Boot 应用的必备注解。

### 1.7.1 健康检查 Controller

> **说明**：创建健康检查接口类。右键 `com.blog` 包 → **New → Package** 创建子包 **`com.blog.controller`**
> （或直接在 `com.blog` 上右键 → New → Java Class，类名输入 `controller.HealthController`，IDEA 会自动创建子包），
> 再在该包中创建类 **`HealthController`**，填入以下代码。
> 这是骨架阶段的第一个接口，后续部署时也可用作容器健康检查。

```java
// backend/src/main/java/com/blog/controller/HealthController.java
package com.blog.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class HealthController {

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "timestamp", Instant.now().toString(),
                "service", "blog-platform"
        ));
    }
}
```

---

## 1.8 .gitignore

`backend/.gitignore` 由 1.5.1 的 IDEA 向导自动生成（Spring Initializr 模板，已覆盖 `target/`、`*.iml` 等），无需手动创建或修改。

本项目的 Git 仓库初始化在 **`java-blog/` 根目录**（而非 `backend/` 内），这样 Part 5 创建的 `frontend/` 与后端同属一个仓库，便于统一提交、统一走 CI/CD（Part 8）。初始化命令：

```powershell
cd D:\Program\Java\blog-project\java-blog
git init
git branch -m main
```

由于 `backend/.gitignore` 只管 `backend/` 内部，挡不住外层 `java-blog/.idea/`，需在 `java-blog/` 下新建**根级 `.gitignore`**：

```gitignore
# java-blog/.gitignore
# Java 构建产物
backend/target/
frontend/node_modules/
frontend/dist/

# IDE
.idea/
*.iml
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# 环境配置
.env
.env.local
.env.production

# 日志
*.log

# SSL 证书（本地生成，不应提交）
# 忽略 ssl 目录下的所有直接文件/子目录
nginx/ssl/*
# 不忽略 .gitkeep 占位文件（保证目录结构被提交）
!nginx/ssl/.gitkeep
```

> **说明**：上面的 `frontend/node_modules`、`frontend/dist`、`nginx/ssl/*` 等条目对应的目录分别在 **Part 5**（前端脚手架）与 **Part 8**（Nginx + mkcert 证书）才创建；在 Part 1 阶段这些路径尚不存在，写入 `.gitignore` 不会报错，提前列全可保证后续各 Part 生成的敏感文件（尤其 SSL 私钥）始终不被误提交。

提交前用 `git status` 确认 `.idea/`、`target/` 均未出现在待提交列表中。
此外 Part 5 的 create-vite 脚手架还会自动生成 `frontend/.gitignore`（已含 `node_modules`），与根级 `.gitignore` 的 `frontend/node_modules/` 形成双重兑底，互不冲突。

---

## 1.9 验证项目启动

完成以上步骤后，验证后端骨架能正常启动。**本章不需要数据库**，直接运行即可。以下两种方式任选其一：

### 方式一：IDEA 图形化运行（推荐）

1. 在 IDEA 左侧 **Project** 视图中，打开 `backend/src/main/java/com/blog/Application.java`
2. 点击类名（或 `main` 方法）左侧的**绿色三角形 ▶** → 选择 **Run 'Application.main()'**；
   也可以右键该文件 → **Run 'Application.main()'**，或使用快捷键 `Shift + F10`
3. 底部弹出 **Run** 工具窗口，启动日志实时输出，出现 `Started Application` 即启动成功
4. 需要停止时，点击 Run 窗口左上角的**红色方块 ■**（快捷键 `Ctrl + F2`）

> **说明**：首次运行后，IDEA 顶部工具栏会出现运行配置下拉框（默认显示 `Application`），
> 之后直接点旁边的 ▶ 或按 `Shift + F10` 即可重复启动，无需再找类文件。
> 如果窗口标题显示的是 `backend [Application]` 这类 Maven 运行配置，效果相同。
> 若出现端口占用或配置问题，可通过 **Run → Edit Configurations** 查看/修改运行配置。

### 方式二：命令行运行（Maven 插件）

```powershell
# 在 backend 目录执行
cd D:\Program\Java\blog-project\java-blog\backend
mvn spring-boot:run
```

启动成功后（控制台出现 `Started Application`），访问健康检查接口：

```powershell
# 验证后端运行（注意用 curl.exe：PowerShell 中 curl 是 Invoke-WebRequest 的别名，
# 会弹出“脚本执行风险”安全警告；curl.exe 是 Windows 自带的真正 curl）
curl.exe http://localhost:8080/api/health
# 期望返回: {"status":"UP","timestamp":"...","service":"blog-platform"}
```

> **说明**：启动日志中若出现如下 WARNING，属正常现象，可忽略：
>
> ```
> WARNING: java.lang.System::load has been called by org.apache.tomcat.jni.Library ...
> WARNING: Use --enable-native-access=ALL-UNNAMED to avoid a warning for callers in this module
> WARNING: Restricted methods will be blocked in a future release unless native access is enabled
> ```
>
> 原因：内嵌 Tomcat 启动时尝试加载可选的 APR 原生加速库（tomcat-native），`System.load` 属于 JDK 的受限方法（涉及原生代码调用），JDK 22+ 会打印此类警告。
> 本机未安装该原生库时，Tomcat 自动回退到纯 Java 的 NIO 连接器，功能完全不受影响。
> 若希望消除警告，可在 IDEA 运行配置的 **Modify options → Add VM options** 中添加 `--enable-native-access=ALL-UNNAMED`。

> **下一步**：Part 2 将从第一个业务功能「用户认证」开始写代码。
> 当用户数据需要持久化时，才会启动 PostgreSQL 容器、引入 JPA 与 Flyway 建表；
> 当需要无状态认证时，才会引入 Spring Security、JWT 与 Redis。
