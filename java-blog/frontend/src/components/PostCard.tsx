import { Link } from 'react-router-dom';
import type { Post } from '../api/types';

export function PostCard({ post }: { post: Post }) {
    return (
        <Link to={`/posts/${post.id}`}
              className="block bg-white dark:bg-gray-800 rounded-xl shadow hover:shadow-lg transition-shadow overflow-hidden">
            {post.cover_image && (
                <img src={post.cover_image} alt={post.title} className="w-full h-48 object-cover" />
            )}
            <div className="p-5">
                {/* [TailwindCSS] 标签列表 */}
                <div className="flex flex-wrap gap-2 mb-2">
                    {post.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 text-xs bg-primary-50 text-primary-600 rounded-full">
              {tag}
            </span>
                    ))}
                </div>
                <h2 className="text-lg font-semibold mb-2 line-clamp-2">{post.title}</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-3">{post.summary}</p>
                <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                    {/* 日期优先显示 updated_at，fallback 到 published_at */}
                    <span>{new Date(post.updated_at || post.published_at).toLocaleDateString()}</span>
                    <div className="flex gap-3">
                        {/* 非 published 文章显示状态标签 */}
                        {post.status !== 'published' && (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                                post.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                            }`}>
                {post.status}
              </span>
                        )}
                        <span>{post.view_count} views</span>
                        <span>{post.like_count} likes</span>
                    </div>
                </div>
            </div>
        </Link>
    );
}