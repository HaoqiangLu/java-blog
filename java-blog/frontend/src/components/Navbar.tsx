// [TailwindCSS] 顶部导航栏 — Logo + 搜索 + 用户菜单
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useState } from 'react';

export function Navbar() {
    const { user, isAuthenticated, logout } = useAuthStore();
    const { toggleSidebar } = useUIStore();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/posts?search=${encodeURIComponent(searchQuery)}`);
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-40">
            <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between">
                {/* 左侧：汉堡菜单 + Logo */}
                <div className="flex items-center gap-4">
                    <button onClick={toggleSidebar} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <Link to="/" className="text-xl font-bold text-primary-600">
                        Blog Platform
                    </Link>
                </div>

                {/* 中间：搜索框 */}
                <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md mx-8">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search posts..."
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                </form>

                {/* 右侧：用户菜单 */}
                <div className="flex items-center gap-4">
                    {isAuthenticated ? (
                        <>
                            <Link to="/posts/new" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                New Post
                            </Link>
                            <Link to="/chat" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </Link>
                            <Link to="/ai-chat" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title="AI Assistant">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            </Link>
                            <span className="text-sm text-gray-600 dark:text-gray-300">{user?.username}</span>
                            <button onClick={() => { logout(); navigate('/login'); }}
                                    className="text-sm text-red-600 hover:text-red-700">
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">Login</Link>
                            <Link to="/register" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                Register
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}