import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    animation?: 'scale' | 'slide-up' | 'slide-right' | 'flip';
}

export const Modal = ({ isOpen, onClose, title, children, size = 'md', animation = 'scale' }: ModalProps) => {
    const [isClosing, setIsClosing] = useState(false);
    const [render, setRender] = useState(isOpen);

    useEffect(() => {
        if (isOpen) {
            setRender(true);
            setIsClosing(false);
        } else if (render) {
            handleClose();
        }
    }, [isOpen]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            setRender(false);
            onClose();
        }, 300); // Wait for animation trick
    };

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        if (render) {
            window.addEventListener('keydown', handleEsc);
        }
        return () => window.removeEventListener('keydown', handleEsc);
    }, [render, onClose]);

    if (!render) return null;

    const sizeClasses = {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        '2xl': 'max-w-6xl'
    };

    const animationClasses = {
        scale: isClosing
            ? 'animate-out fade-out zoom-out-95 duration-200 ease-in'
            : 'animate-in fade-in zoom-in-95 duration-300 ease-out',
        'slide-up': isClosing
            ? 'animate-out fade-out slide-out-to-bottom-8 duration-200 ease-in'
            : 'animate-in fade-in slide-in-from-bottom-8 duration-300 ease-out',
        'slide-right': isClosing
            ? 'animate-out fade-out slide-out-to-left-8 duration-200 ease-in'
            : 'animate-in fade-in slide-in-from-left-8 duration-300 ease-out',
        flip: isClosing
            ? 'animate-out fade-out zoom-out-90 duration-200 ease-in'
            : 'animate-in fade-in zoom-in-90 duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]'
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-slate-900/20 transition-opacity ${isClosing ? 'animate-out fade-out duration-200' : 'animate-in fade-in duration-300'
                    }`}
                onClick={handleClose}
            />

            {/* Modal Dialog */}
            <div className={`relative w-full ${sizeClasses[size]} transform transition-all ${animationClasses[animation]}`}>
                <div className="modal-glass rounded-[24px] m-0 overflow-hidden">
                    <div className="apple-glass-content">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
                            <h3 className="text-[18px] font-[600] text-[var(--modal-heading-color)] tracking-[-0.3px]">{title}</h3>
                            <button
                                onClick={handleClose}
                                className="p-1 rounded-lg text-slate-800 dark:text-white opacity-50 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-white/20 transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="apple-glass-content p-6 overflow-y-auto max-h-[72vh] custom-scrollbar" style={{ position: 'relative', zIndex: 1 }}>
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
