// [TailwindCSS] 响应式布局 — 导航栏 + 侧边栏 + 主内容区
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { useUIStore } from '../stores/uiStore';

export function Layout() {
    const { sidebarOpen } = useUIStore();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* [TailwindCSS] 固定顶部导航栏 */}
            <Navbar />

            <div className="flex pt-16">
                {/* [TailwindCSS] 响应式侧边栏 — lg 以上显示，以下隐藏 */}
                <aside className={`
          ${sidebarOpen ? 'block' : 'hidden'}
          lg:block w-64 shrink-0
          fixed lg:sticky top-16 h-[calc(100vh-4rem)]
          bg-white dark:bg-gray-800
          border-r border-gray-200 dark:border-gray-700
          overflow-y-auto z-30
        `}>
                    <nav className="p-4 space-y-2">
                        <a href="/" className="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                            Home
                        </a>
                        <a href="/posts" className="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                            Posts
                        </a>
                        <a href="/chat" className="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                            Chat
                        </a>
                    </nav>
                </aside>

                {/* [TailwindCSS] 主内容区 — 自适应宽度 */}
                <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}