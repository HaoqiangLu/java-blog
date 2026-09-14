import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyPosts } from '../api/queries';
import { useAuthStore } from '../stores/authStore';
import { PostCard } from '../components/PostCard';

export function HomePage() {
    const { isAuthenticated } = useAuthStore();
    const navigate = useNavigate();
    const [page, setPage] = useState(1);

    // 未登录时引导去登录
    if (!isAuthenticated) {
        return (
            <div className="text-center py-20">
                <h1 className="text-3xl font-bold mb-4">Welcome to Blog Platform</h1>
                <p className="text-gray-500 mb-8">Login to see your posts.</p>
                <button onClick={() => navigate('/login')}
                        className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                    Login
                </button>
            </div>
        );
    }

    const { data, isLoading } = useMyPosts(page);

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">My Posts</h1>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
                </div>
            ) : data?.items?.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-gray-500 mb-4">No posts yet.</p>
                    <button onClick={() => navigate('/posts/new')}
                            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                        Create Your First Post
                    </button>
                </div>
            ) : (
                <>
                    <div className="grid gap-6 md:grid-cols-2">
                        {data?.items.map((post) => (
                            <PostCard key={post.id} post={post} />
                        ))}
                    </div>

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