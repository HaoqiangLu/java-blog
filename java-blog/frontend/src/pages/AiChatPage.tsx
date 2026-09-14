// [AI] AI 聊天助手 — 支持 Provider 切换 + 多轮对话
import { useState, useRef, useEffect } from 'react';
import { useAiProviders, useAiChat } from '../api/queries';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import type { AiMessage } from '../api/types';

export function AiChatPage() {
    const { data: providersData } = useAiProviders();
    const aiChat = useAiChat();
    const [messages, setMessages] = useState<AiMessage[]>([]);
    const [input, setInput] = useState('');
    const [selectedProvider, setSelectedProvider] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 加载 Provider 列表后，默认选中第一个
    useEffect(() => {
        if (providersData?.providers.length && !selectedProvider) {
            setSelectedProvider(providersData.providers[0]);
        }
    }, [providersData, selectedProvider]);

    // 自动滚动到最新消息
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

        // 把之前的对话拼成 context 供模型参考
        const context = messages.map(m => `${m.role}: ${m.content}`).join('\n');

        aiChat.mutate(
            { message: userMessage, context, provider: selectedProvider },
            {
                onSuccess: (data) => {
                    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
                },
                onError: () => {
                    setMessages(prev => [...prev, { role: 'assistant', content: 'AI service is currently unavailable.' }]);
                },
            }
        );
    };

    return (
        <div className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow flex flex-col h-[calc(100vh-8rem)]">
                {/* 顶栏：标题 + Provider 切换 */}
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="text-lg font-bold">AI Assistant</h2>
                    <select
                        value={selectedProvider}
                        onChange={(e) => setSelectedProvider(e.target.value)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                    >
                        {providersData?.providers.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>

                {/* 消息列表 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-400 mt-20">
                            Ask me anything about the blog...
                        </div>
                    )}
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {/* 注意：whitespace-pre-wrap 只给用户消息保留；助手消息走 Markdown 渲染，
                                若保留它会把渲染后 HTML 源码里的换行再显示成空行 */}
                            <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                                msg.role === 'user'
                                    ? 'bg-primary-600 text-white rounded-br-sm whitespace-pre-wrap'
                                    : 'bg-gray-100 dark:bg-gray-700 rounded-bl-sm'
                            }`}>
                                {/* 助手回复复用文章详情页的 Markdown 渲染组件（marked + DOMPurify）；
                                    用户消息保持纯文本 */}
                                {msg.role === 'user' ? (
                                    msg.content
                                ) : (
                                    <MarkdownRenderer
                                        content={msg.content}
                                        className="prose prose-sm dark:prose-invert max-w-none"
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                    {aiChat.isPending && (
                        <div className="flex justify-start">
                            <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-2xl rounded-bl-sm text-sm text-gray-400">
                                Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* 输入框 */}
                <form onSubmit={handleSend} className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask AI..."
                            disabled={aiChat.isPending}
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || aiChat.isPending}
                            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                            Send
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}