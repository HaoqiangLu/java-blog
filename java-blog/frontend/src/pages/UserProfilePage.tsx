// [React Router] useParams 取 URL 用户 ID + TanStack Query 缓存
import { useParams } from 'react-router-dom';
import { useUser } from '../api/queries';

export function UserProfilePage() {
    const { id } = useParams<{ id: string }>();
    const { data: user, isLoading, error } = useUser(id!);

    if (isLoading) {
        return (
            <div className="flex justify-center py-20">
                <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error || !user) {
        return (
            <div className="max-w-md mx-auto mt-20 text-center">
                <p className="text-gray-500">User not found.</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto mt-10">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                {/* [TailwindCSS] 头像 + 基本信息 */}
                <div className="flex items-center gap-6 mb-6">
                    {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.display_name || user.username}
                             className="w-20 h-20 rounded-full object-cover" />
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-2xl font-bold text-primary-600">
                            {(user.display_name || user.username).charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold">{user.display_name || user.username}</h1>
                        <p className="text-gray-500 dark:text-gray-400">@{user.username}</p>
                    </div>
                </div>

                {/* 个人简介 */}
                {user.bio && (
                    <p className="mb-4 text-gray-700 dark:text-gray-300">{user.bio}</p>
                )}

                {/* 注册时间 */}
                <p className="text-sm text-gray-400">
                    Joined {new Date(user.created_at).toLocaleDateString()}
                </p>
            </div>
        </div>
    );
}