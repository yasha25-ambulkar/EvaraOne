import React from 'react';

interface TDSMeterVisualProps {
    tdsValue: number;
    quality: 'Good' | 'Acceptable' | 'Critical';
}

const QUALITY_CFG = {
<<<<<<< HEAD
    Good:       { lcd: '#4ade80', glow: 'rgba(74,222,128,0.55)',  badge: '#16a34a', label: 'GOOD QUALITY'  },
    Acceptable: { lcd: '#facc15', glow: 'rgba(250,204,21,0.55)',  badge: '#b45309', label: 'ACCEPTABLE'    },
    Critical:   { lcd: '#f87171', glow: 'rgba(248,113,113,0.55)', badge: '#dc2626', label: 'CRITICAL'      },
=======
    Good: { lcd: '#4ade80', glow: 'rgba(74,222,128,0.55)', badge: '#16a34a', label: 'GOOD QUALITY' },
    Acceptable: { lcd: '#facc15', glow: 'rgba(250,204,21,0.55)', badge: '#b45309', label: 'ACCEPTABLE' },
    Critical: { lcd: '#f87171', glow: 'rgba(248,113,113,0.55)', badge: '#dc2626', label: 'CRITICAL' },
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
};

const TDSMeterVisual: React.FC<TDSMeterVisualProps> = ({ tdsValue, quality }) => {
    const cfg = QUALITY_CFG[quality] || QUALITY_CFG.Good;
<<<<<<< HEAD
=======
    // Scale number so it always fits inside the 68px-wide screen (viewBox 0 0 140 400)
    const rounded = Math.round(tdsValue);
    const digits = String(Math.abs(rounded)).length;
    const valueFontSize = digits >= 4 ? 24 : digits === 3 ? 33 : digits === 2 ? 44 : 52;
    const valueY        = digits >= 4 ? 118 : digits === 3 ? 119 : digits === 2 ? 121 : 122;
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020

    return (
        <div className="relative w-full h-full flex flex-col overflow-hidden select-none bg-transparent">

            {/* ── Upper area: meter probe ── */}
            <div className="flex-1 flex items-end justify-center relative pb-12">

                {/* Ambient glow behind device */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-[400px] rounded-full opacity-30 blur-[80px] pointer-events-none z-0"
                    style={{ background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 70%)` }} />

                {/* TDS Meter Body SVG */}
                <div className="relative z-20 flex items-end justify-center h-full w-full mb-[-2px]">
                    <svg
                        viewBox="0 0 140 400"
                        width="140"
                        height="400"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="drop-shadow-[0_45px_65px_rgba(0,0,0,0.4)]"
                    >
                        <defs>
                            <linearGradient id="meterBody" x1="0" y1="0" x2="1" y2="0.2">
                                <stop offset="0%" stopColor="#2c313a" />
                                <stop offset="50%" stopColor="#3d4450" />
                                <stop offset="100%" stopColor="#1a1e24" />
                            </linearGradient>
<<<<<<< HEAD
                            
=======

>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                            <linearGradient id="tipMetal" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#808da1" />
                                <stop offset="35%" stopColor="#d1dce8" />
                                <stop offset="50%" stopColor="#f8fafc" />
                                <stop offset="65%" stopColor="#b4bed0" />
                                <stop offset="100%" stopColor="#64748b" />
                            </linearGradient>

                            <linearGradient id="screenGlass" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0a1a0a" />
                                <stop offset="100%" stopColor="#051005" />
                            </linearGradient>

                            <filter id="lcdGlowEffect" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="4" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {/* --- Probe Tip (Pointier Metal) --- */}
                        <path d="M42 245 L98 245 L70 380 Z" fill="url(#tipMetal)" />
                        {/* Tip Highlights */}
                        <path d="M68 245 L72 245 L70 370 Z" fill="white" opacity="0.3" />

                        {/* --- Main Body (More rounded) --- */}
                        <rect x="20" y="20" width="100" height="250" rx="45" fill="url(#meterBody)" />
<<<<<<< HEAD
                        
                        {/* Subtle Rim Highlight */}
                        <path d="M65 20 H75 C100 20 120 40 120 65 V205 C120 230 100 250 75 250 H65 C40 250 20 230 20 205 V65 C20 40 40 20 65 20Z" 
                              stroke="white" strokeOpacity="0.1" strokeWidth="1.5" />
=======

                        {/* Subtle Rim Highlight */}
                        <path d="M65 20 H75 C100 20 120 40 120 65 V205 C120 230 100 250 75 250 H65 C40 250 20 230 20 205 V65 C20 40 40 20 65 20Z"
                            stroke="white" strokeOpacity="0.1" strokeWidth="1.5" />
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020

                        {/* LCD Screen Section */}
                        <g>
                            {/* Screen Bezel Glow */}
                            <rect x="28" y="52" width="84" height="121" rx="22" fill={cfg.lcd} opacity="0.15" filter="url(#lcdGlowEffect)" />
<<<<<<< HEAD
                            
                            {/* Screen Frame */}
                            <rect x="32" y="55" width="76" height="115" rx="18" fill="#000" stroke="#4a5568" strokeWidth="1" />
                            
                            {/* Inner Screen */}
                            <rect x="36" y="59" width="68" height="107" rx="14" fill="url(#screenGlass)" />
                        </g>
                        
                        {/* LCD Value */}
                        <text x="70" y="125" textAnchor="middle" fontSize="62" fontWeight="400" 
                              fontFamily="'Share Tech Mono', monospace" fill={cfg.lcd} style={{ filter: 'url(#lcdGlowEffect)' }} 
                              letterSpacing="-1">
                            {tdsValue}
                        </text>
                        <text x="70" y="152" textAnchor="middle" fontSize="13" fontWeight="400" 
                              fontFamily="'Share Tech Mono', monospace" fill={cfg.lcd} opacity="0.8">ppm</text>
=======

                            {/* Screen Frame */}
                            <rect x="32" y="55" width="76" height="115" rx="18" fill="#000" stroke="#4a5568" strokeWidth="1" />

                            {/* Inner Screen */}
                            <rect x="36" y="59" width="68" height="107" rx="14" fill="url(#screenGlass)" />
                        </g>

                        {/* LCD Value — responsive font so number never overflows screen */}
                        <text x="70" y={valueY} textAnchor="middle" fontSize={valueFontSize} fontWeight="400"
                            fontFamily="'Share Tech Mono', monospace" fill={cfg.lcd} style={{ filter: 'url(#lcdGlowEffect)' }}
                            letterSpacing="-1">
                            {rounded}
                        </text>
                        <text x="70" y="152" textAnchor="middle" fontSize="13" fontWeight="400"
                            fontFamily="'Share Tech Mono', monospace" fill={cfg.lcd} opacity="0.8" letterSpacing="3">ppm</text>
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020

                        {/* Brand Section */}
                        <g transform="translate(70, 205)" opacity="0.4">
                            <path d="M-8 -10 C-12 -6 -12 2 -8 6 C-4 10 4 10 8 6 C12 2 12 -6 8 -10 C4 -14 -4 -14 -8 -10" fill="currentColor" />
                            <text y="15" textAnchor="middle" fontSize="10" fontWeight="900" fill="currentColor" letterSpacing="0.5">EvaraTech</text>
                        </g>

                        {/* Side Buttons */}
                        <rect x="119" y="85" width="4" height="35" rx="2" fill="#151921" />
                        <rect x="119" y="130" width="4" height="35" rx="2" fill="#151921" />
                    </svg>
                </div>

                {/* Enhanced Splash Effect */}
                <div className="absolute bottom-[35%] left-1/2 -translate-x-1/2 w-64 h-24 z-30 pointer-events-none">
                    <svg viewBox="0 0 200 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
                        <circle cx="100" cy="30" r="1.5" fill="white" className="animate-pulse" />
                        <circle cx="80" cy="25" r="2" fill="white" opacity="0.5" />
                        <circle cx="120" cy="28" r="1" fill="white" />
                        <circle cx="90" cy="40" r="2.5" fill="white" opacity="0.3" />
                        <path d="M70 30 Q100 15 130 30" stroke="white" strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />
                    </svg>
                </div>
            </div>

            {/* ── Realistic Water Body ── */}
            <div className="absolute bottom-0 left-0 w-full overflow-hidden z-10"
                style={{
                    height: '40%',
                    background: 'linear-gradient(180deg, rgba(0,130,243,0.9) 0%, rgba(0,77,178,0.95) 100%)',
                    backdropFilter: 'blur(8px)'
                }}>

                {/* Surface highlight line */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-white opacity-50 z-20" />
<<<<<<< HEAD
                
=======

>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                {/* Surface Reflection */}
                <div className="absolute top-0 left-0 w-full h-16 pointer-events-none z-20"
                    style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 100%)',
                        animation: 'tdsShine 6s ease-in-out infinite',
                    }} />

                {/* Primary realistic wave */}
                <div className="absolute top-[-10px] left-0 w-[200%] h-20 z-10"
                    style={{
                        backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 560 40' fill='%23ffffff3a' xmlns='http://www.w3.org/2000/svg'><path d='M0 20C140 20 140 0 280 0C420 0 420 20 560 20V40H0V20Z'/></svg>")`,
                        backgroundRepeat: 'repeat-x',
                        backgroundPosition: '0 bottom',
                        animation: 'tdsWave 10s linear infinite',
                    }} />
<<<<<<< HEAD
                
=======

>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                {/* Secondary subtle wave */}
                <div className="absolute top-[-5px] left-[-30%] w-[200%] h-20 z-[5] opacity-30"
                    style={{
                        backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 560 40' fill='%23ffffff2a' xmlns='http://www.w3.org/2000/svg'><path d='M0 20C140 20 140 0 280 0C420 0 420 20 560 20V40H0V20Z'/></svg>")`,
                        backgroundRepeat: 'repeat-x',
                        backgroundPosition: '0 bottom',
                        animation: 'tdsWave 15s linear infinite reverse',
                    }} />

                {/* Deep water depth shadow */}
                <div className="absolute left-1/2 -top-20 -translate-x-1/2 w-48 h-64 bg-black/30 blur-[60px] rounded-full z-[8]" />
            </div>
        </div>
    );
};

export default TDSMeterVisual;
