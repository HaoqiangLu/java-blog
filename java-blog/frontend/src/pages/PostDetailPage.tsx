// [Marked + DOMPurify] Markdown 渲染 + XSS 防护
import { useParams, useNavigate } from 'react-router-dom';
import { usePost, useLikePost } from '../api/queries';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { CommentSection } from '../components/CommentSection';
import { useAuthStore } from '../stores/authStore';
import { useAiSummary } from '../api/queries';
import { useState } from 'react';

export function PostDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: post, isLoading, error } = usePost(id!);
    const likePost = useLikePost();
    const { user, isAuthenticated } = useAuthStore();
    const aiSummary = useAiSummary();
    const [showSummary, setShowSummary] = useState(false);

    if (isLoading) return (
        <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
    );
    if (error || !post) return <div className="text-center py-20 text-red-500">Post not found</div>;

    // 仅文章作者可见编辑按钮
    const isAuthor = isAuthenticated && user?.id === post.author_id;

    return (
        <article className="max-w-6xl mx-auto">
            <header className="mb-8">
                {/* [排版] 标题独自一行：占满容器宽度，不与按钮同行被挤压换行 */}
                <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
                {/* [排版] 元信息行：日期/浏览/点赞/tags 在左，操作按钮经 ml-auto 右对齐同行 */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    <span>{new Date(post.published_at || post.created_at).toLocaleDateString()}</span>
                    <span>{post.view_count} views</span>
                    <button
                        onClick={() => likePost.mutate(post.id)}
                        disabled={likePost.isPending || !isAuthenticated}
                        className="flex items-center gap-1 hover:text-primary-600 disabled:opacity-50"
                    >
                        ♥ {post.like_count}
                    </button>
                    <div className="flex gap-2">
                        {post.tags.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs">{tag}</span>
                        ))}
                    </div>
                    {/* [排版] 操作按钮组：ml-auto 推到行尾右对齐 */}
                    <div className="ml-auto flex items-center gap-2">
                        {isAuthor && (
                            <button
                                onClick={() => navigate(`/posts/${post.id}/edit`)}
                                className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                Edit
                            </button>
                        )}
                        <button
                            onClick={() => {
                                aiSummary.mutate(post.content || '');
                                setShowSummary(true);
                            }}
                            disabled={aiSummary.isPending}
                            className="px-4 py-2 text-sm bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 disabled:opacity-50"
                        >
                            {aiSummary.isPending ? 'Generating...' : '✨ AI Summary'}
                        </button>
                    </div>
                </div>
            </header>

            {showSummary && aiSummary.isError && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-600 dark:text-red-300">
                    AI 摘要生成失败：{aiSummary.error?.message}
                </div>
            )}

            {showSummary && aiSummary.isSuccess && !aiSummary.data?.summary && (
                <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
                    AI 返回了空内容，请检查后端日志中是否有 [provider] AI request failed
                </div>
            )}

            {showSummary && aiSummary.data?.summary && (
                <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">AI Summary</span>
                        <button onClick={() => setShowSummary(false)} className="text-sm text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{aiSummary.data.summary}</p>
                </div>
            )}

            {/* [Marked + DOMPurify] 安全渲染 Markdown 内容 */}
            <MarkdownRenderer content={post.content_html || post.content || ''} />

            {/* 评论区 */}
            <div className="mt-12 border-t border-gray-200 dark:border-gray-700 pt-8">
                <CommentSection postId={post.id} />
            </div>
        </article>
    );
}