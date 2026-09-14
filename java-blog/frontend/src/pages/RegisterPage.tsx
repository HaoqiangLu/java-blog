// [React 19] 注册页面 — 表单 + useRegister mutation
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '../api/queries';
import { validateUsername, validateEmail, validatePassword } from '../utils/validation';

export function RegisterPage() {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const registerMutation = useRegister();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // [输入校验] 任一字段不通过就拦下、显示错误，不发请求
        for (const result of [validateUsername(username), validateEmail(email), validatePassword(password)]) {
            if (!result.valid) {
                setError(result.error ?? 'Invalid input');
                return;
            }
        }

        try {
            await registerMutation.mutateAsync({ username, email, password });
            navigate('/login');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Registration failed');
        }
    };

    return (
        <div className="max-w-md mx-auto mt-20">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <h1 className="text-2xl font-bold text-center mb-8">Create Account</h1>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Username</label>
                        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required
                               className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                               className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                               className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <button type="submit" disabled={registerMutation.isPending}
                            className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                        {registerMutation.isPending ? 'Creating account...' : 'Register'}
                    </button>
                </form>

                <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                    Already have an account? <Link to="/login" className="text-primary-600 hover:underline">Sign In</Link>
                </p>
            </div>
        </div>
    );
}