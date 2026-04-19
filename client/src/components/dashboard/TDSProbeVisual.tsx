import React from 'react';
import { motion } from 'framer-motion';

interface TDSProbeVisualProps {
    value: number;
}

export const TDSProbeVisual: React.FC<TDSProbeVisualProps> = ({ value }) => {
    return (
        <div className="relative w-full h-[500px] flex justify-center overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-[150px] h-[350px] bg-blue-400/30 blur-[60px] rounded-full point-events-none" />

            {/* TDS Probe SVG */}
            <div className="relative z-10 w-[200px] mt-10">
                <svg viewBox="0 0 200 400" className="w-full h-full drop-shadow-2xl">
                    <defs>
                        <linearGradient id="probeBodyBase" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#1a1c23" />
                            <stop offset="15%" stopColor="#303440" />
                            <stop offset="85%" stopColor="#303440" />
                            <stop offset="100%" stopColor="#1a1c23" />
                        </linearGradient>
                        <linearGradient id="metallics" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#4a4d57" />
                            <stop offset="30%" stopColor="#a3a9b5" />
                            <stop offset="70%" stopColor="#a3a9b5" />
                            <stop offset="100%" stopColor="#3a3d45" />
                        </linearGradient>
                        <linearGradient id="screenTrim" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#1a1c23" />
                            <stop offset="100%" stopColor="#3d404a" />
                        </linearGradient>
                    </defs>

                    {/* Side Buttons */}
                    <rect x="135" y="90" width="8" height="25" rx="3" fill="#2a2d36" />
                    <rect x="135" y="130" width="8" height="25" rx="3" fill="#2a2d36" />

                    {/* Main Body */}
                    <rect x="65" y="40" width="70" height="210" rx="35" fill="url(#probeBodyBase)" />

                    {/* Metallic Tip (Cone shape) */}
                    <path d="M75 250 L125 250 L108 330 L92 330 Z" fill="url(#metallics)" />
                    
                    {/* Lower Tip Point */}
                    <path d="M92 330 L108 330 L100 350 Z" fill="#666" />

                    {/* Screen Trim / Bezel */}
                    <rect x="73" y="65" width="54" height="95" rx="15" fill="url(#screenTrim)" />
                    
                    {/* Inner Screen */}
                    <rect x="76" y="68" width="48" height="89" rx="12" fill="#122416" stroke="#10b981" strokeWidth="2" strokeOpacity="0.6" />

                    {/* Screen Content */}
                    <g transform="translate(0, -3)">
                        <text x="100" y="115" fontFamily="monospace" fontSize="30" fill="#10b981" fontWeight="bold" textAnchor="middle" style={{ textShadow: '0 0 12px rgba(16, 185, 129, 0.8), 0 0 20px rgba(16, 185, 129, 0.4)' }}>
                            {Math.round(value)}
                        </text>
                        <text x="100" y="135" fontFamily="sans-serif" fontSize="11" fill="#10b981" textAnchor="middle" letterSpacing="1" style={{ textShadow: '0 0 8px rgba(16, 185, 129, 0.6)' }}>
                            PPM
                        </text>
                    </g>

                    {/* Logo Area */}
                    <circle cx="100" cy="185" r="10" fill="#1e2028" />
                    <path d="M94 185 C 94 179, 106 179, 106 185" stroke="#4a4d58" strokeWidth="2" fill="none" strokeLinecap="round" />
                    <circle cx="100" cy="185" r="3" fill="#4a4d58" />
                    
                    <text x="100" y="208" fontFamily="sans-serif" fontSize="10" fill="#4a4d58" textAnchor="middle" letterSpacing="0.5" fontWeight="500">
                        EvaraTech
                    </text>
                </svg>
            </div>

            {/* Rising Bubbles */}
            <div className="absolute inset-0 z-15 pointer-events-none">
                {[...Array(6)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute bottom-[80px] bg-white/40 rounded-full border border-white/50 backdrop-blur-sm"
                        style={{
                            left: `calc(50% + ${Math.random() * 40 - 20}px)`,
                            width: `${Math.random() * 6 + 3}px`,
                            height: `${Math.random() * 6 + 3}px`,
                        }}
                        animate={{
                            y: [0, -100 - Math.random() * 50],
                            x: [0, Math.random() * 20 - 10],
                            opacity: [0, 1, 0],
                            scale: [0.5, 1.2, 0.8],
                        }}
                        transition={{
                            duration: 2 + Math.random() * 2,
                            repeat: Infinity,
                            delay: Math.random() * 2,
                            ease: "easeOut",
                        }}
                    />
                ))}
            </div>

        </div>
    );
};
