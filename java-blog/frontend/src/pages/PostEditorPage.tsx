// [React] Markdown 编辑器 — 编辑 + 实时预览
import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreatePost, useUpdatePost, usePost } from '../api/queries';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

export function PostEditorPage() {
    const { id } = useParams<{ id: string }>();
    const isEditing = !!id;
    const navigate = useNavigate();
    const { data: existingPost } = usePost(id!);

    const [title, setTitle] = useState(existingPost?.title || '');
    const [content, setContent] = useState(existingPost?.content || '');
    const [tags, setTags] = useState(existingPost?.tags.join(', ') || '');
    const [status, setStatus] = useState(existingPost?.status || 'draft');

    const createPost = useCreatePost();
    const updatePost = useUpdatePost();

    // [UX] 双栏同步滚动：按"已滚比例"映射到另一栏；
    // syncingRef 防止程序设置 scrollTop 触发对方 onScroll 造成死循环
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const syncingRef = useRef(false);

    const handleScroll = (source: 'editor' | 'preview') => {
        if (syncingRef.current) return;
        const from = source === 'editor' ? editorRef.current : previewRef.current;
        const to = source === 'editor' ? previewRef.current : editorRef.current;
        if (!from || !to) return;
        const fromMax = from.scrollHeight - from.clientHeight;
        if (fromMax <= 0) return;
        syncingRef.current = true;
        to.scrollTop = (from.scrollTop / fromMax) * (to.scrollHeight - to.clientHeight);
        requestAnimationFrame(() => { syncingRef.current = false; });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const postData = {
            title, content,
            tags: tags.split(/[,，;；]/).map(t => t.trim()).filter(Boolean),
            status,
        };

        if (isEditing && id) {
            await updatePost.mutateAsync({ id, ...postData });
        } else {
            await createPost.mutateAsync(postData);
        }
        navigate('/posts');
    };

    return (
        <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">{isEditing ? 'Edit Post' : 'New Post'}</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                       placeholder="Post title" required
                       className="w-full px-4 py-3 text-xl border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" />

                <input type="text" value={tags} onChange={(e) => setTags(e.target.value)}
                       placeholder="Tags (comma separated)"
                       className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" />

                <select value={status} onChange={(e) => setStatus(e.target.value)}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                </select>

                {/* [TailwindCSS] 双栏布局 — 编辑 + 预览；
                    两栏固定为"视口剩余高度"（28rem ≈ 本页双栏上下的总开销），
                    内容超出时栏内滚动，不再撑长整页；textarea 禁用手动 resize 保持两栏等高 */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Markdown</label>
                        <textarea ref={editorRef} onScroll={() => handleScroll('editor')}
                                  value={content} onChange={(e) => setContent(e.target.value)}
                                  className="w-full h-[calc(100vh-28rem)] min-h-[400px] resize-none px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm bg-white dark:bg-gray-700" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Preview</label>
                        <div ref={previewRef} onScroll={() => handleScroll('preview')}
                             className="h-[calc(100vh-28rem)] min-h-[400px] p-4 border border-gray-200 dark:border-gray-600 rounded-lg overflow-y-auto bg-white dark:bg-gray-800">
                            <MarkdownRenderer content={content} />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button type="submit" disabled={createPost.isPending || updatePost.isPending}
                            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                        {isEditing ? 'Update' : 'Create'}
                    </button>
                    <button type="button" onClick={() => navigate(-1)}
                            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}