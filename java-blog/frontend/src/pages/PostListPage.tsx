// [TanStack Query] 文章列表 — 自动缓存、分页、搜索
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePosts, useSearchPosts } from '../api/queries';
import { PostCard } from '../components/PostCard';

export function PostListPage() {
    const [searchParams] = useSearchParams();
    const searchQuery = searchParams.get('search') || '';
    const [page, setPage] = useState(1);

    // [TanStack Query] 根据是否有搜索词选择不同查询
    const postsQuery = usePosts('published', page);
    const searchResult = useSearchPosts(searchQuery, page);
    const data = searchQuery ? searchResult.data : postsQuery.data;
    const isLoading = searchQuery ? searchResult.isLoading : postsQuery.isLoading;

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">
                    {searchQuery ? `Search: "${searchQuery}"` : 'Latest Posts'}
                </h1>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
                </div>
            ) : data?.items?.length === 0 ? (
                <p className="text-center text-gray-500 py-20">No posts found.</p>
            ) : (
                <>
                    <div className="grid gap-6 md:grid-cols-2">
                        {data?.items.map((post) => (
                            <PostCard key={post.id} post={post} />
                        ))}
                    </div>

                    {/* [TailwindCSS] 分页控件 */}
                    <div className="flex justify-center gap-2 mt-8">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="px-4 py-2 rounded-lg border hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                            Previous
                        </button>
                        <span className="px-4 py-2">Page {page}</span>
                        <button onClick={() => setPage(p => p + 1)} disabled={!data || data.items.length < 20}
                                className="px-4 py-2 rounded-lg border hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                            Next
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}