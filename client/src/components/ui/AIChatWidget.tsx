import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User } from 'lucide-react';
import { sendMessageToAI, type ChatMessage } from '../../services/ai';

export default function AIChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: 'Hello! I am your Evara Assistant. How can I help you check your water systems today?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const response = await sendMessageToAI(input);
            const aiMsg: ChatMessage = { role: 'assistant', content: response };
            setMessages(prev => [...prev, aiMsg]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I'm having trouble connecting to the server right now." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[1000] flex flex-col items-end gap-4">

            {/* Chat Window */}
            {isOpen && (
                <div className="apple-glass-card p-0 w-80 md:w-96 h-[500px] flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
                    {/* Header */}
                    <div className="p-4 border-b border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] flex justify-between items-center text-[#1F2937]">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.4)] rounded-[12px] shadow-sm">
                                <Bot className="w-5 h-5 text-[#3A7AFE]" />
                            </div>
                            <div>
                                <h3 className="font-[600] text-[15px] tracking-[-0.3px]">Evara AI</h3>
                                <div className="flex items-center gap-[6px]">
                                    <span className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-pulse shadow-[0_0_8px_rgba(22,163,74,0.6)]"></span>
                                    <span className="text-[11px] font-[600] opacity-60">Online</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-[rgba(255,255,255,0.2)] rounded-[8px] transition-colors opacity-50 hover:opacity-100">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border border-[rgba(255,255,255,0.4)] ${msg.role === 'user' ? 'bg-[rgba(255,255,255,0.3)]' : 'bg-[rgba(58,122,254,0.1)]'}`}>
                                    {msg.role === 'user' ? <User className="w-4 h-4 text-[#1F2937] opacity-70" /> : <Bot className="w-4 h-4 text-[#3A7AFE]" />}
                                </div>
                                <div className={`max-w-[80%] p-3 text-[13px] font-[500] leading-relaxed shadow-sm border border-[rgba(255,255,255,0.4)] ${msg.role === 'user' ? 'bg-[#3A7AFE] text-white rounded-[16px] rounded-tr-[4px] border-none shadow-[0_4px_12px_rgba(58,122,254,0.3)]' : 'bg-[rgba(255,255,255,0.4)] text-[#1F2937] rounded-[16px] rounded-tl-[4px]'}`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-[rgba(58,122,254,0.1)] border border-[rgba(255,255,255,0.4)] flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <Bot className="w-4 h-4 text-[#3A7AFE]" />
                                </div>
                                <div className="bg-[rgba(255,255,255,0.4)] p-3 rounded-[16px] rounded-tl-[4px] shadow-sm border border-[rgba(255,255,255,0.4)] flex gap-1.5 items-center h-10 w-16 justify-center">
                                    <span className="w-1.5 h-1.5 bg-[#1F2937] opacity-40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                    <span className="w-1.5 h-1.5 bg-[#1F2937] opacity-40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                    <span className="w-1.5 h-1.5 bg-[#1F2937] opacity-40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 bg-[rgba(255,255,255,0.1)] border-t border-[rgba(255,255,255,0.1)] flex gap-2 backdrop-blur-md">
                        <input
                            className="flex-1 bg-[rgba(255,255,255,0.4)] border border-[rgba(255,255,255,0.5)] rounded-[12px] px-4 py-2.5 text-[13px] font-[500] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#3A7AFE]/30 focus:border-[#3A7AFE]/50 transition-all shadow-inner"
                            placeholder="Ask about alerts, tank levels..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading}
                            className="p-2.5 bg-[#3A7AFE] text-white rounded-[12px] hover:bg-[#2563EB] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_12px_rgba(58,122,254,0.3)]"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-4 rounded-full shadow-[0_8px_30px_rgba(58,122,254,0.2)] transition-all duration-300 hover:scale-105 ${isOpen ? 'bg-[#3A7AFE] text-white rotate-90 scale-0 opacity-0 hidden' : 'bg-[#3A7AFE] text-white flex items-center justify-center hover:bg-[#2563EB]'}`}
            >
                <MessageSquare className="w-6 h-6" />
            </button>

            {/* Re-open button when closed but logic keeps it consistent with standard patterns */}
            {!isOpen && (
                <div className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full border-2 border-white"></div>
            )}

        </div>
    );
}
