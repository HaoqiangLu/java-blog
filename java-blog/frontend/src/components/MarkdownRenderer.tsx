// [Marked] Markdown 解析器 + [DOMPurify] XSS 防护
import { useMemo } from 'react';
// [Marked] 将 Markdown 文本解析为 HTML
import { marked } from 'marked';
// [DOMPurify] 清洗 HTML — 移除 script 标签等危险内容，防止 XSS
import DOMPurify from 'dompurify';

// [Marked] 配置 Markdown 解析选项
marked.setOptions({
    breaks: true,     // 换行符转为 <br>
    gfm: true,        // 启用 GitHub Flavored Markdown
});

interface Props {
    content: string;
    className?: string;
}

export function MarkdownRenderer({ content, className = 'prose prose-lg dark:prose-invert max-w-none' }: Props) {
    // [React] useMemo — 缓存渲染结果，避免重复解析
    const html = useMemo(() => {
        // [Marked] 解析 Markdown 为 HTML 字符串
        const rawHtml = marked.parse(content) as string;
        // [DOMPurify] 清洗 HTML — 只允许安全标签和属性通过
        return DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li',
                'a','img','strong','em','code','pre','blockquote','table','thead',
                'tbody','tr','th','td','del','sup','sub','span','div'],
            ALLOWED_ATTR: ['href','src','alt','title','class','target','width','height'],
        });
    }, [content]);

    // [TailwindCSS] prose 类提供排版样式（需 @tailwindcss/typography 插件）
    return (
        <div
            className={className}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}