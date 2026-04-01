import { useState, useEffect } from 'react';

interface SplashScreenProps {
    onDone: () => void;
}

const SplashScreen = ({ onDone }: SplashScreenProps) => {
    const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

    useEffect(() => {
        const t1 = setTimeout(() => setPhase('hold'), 50);
        const t2 = setTimeout(() => setPhase('out'), 1200);
        const t3 = setTimeout(onDone, 1700);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [onDone]);

    return (
        <div className={`fixed inset-0 z-[99999] flex items-center justify-center transition-opacity duration-500 ${phase === 'out' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex flex-col items-center justify-center gap-5">
                <img
                    src="/evara-logo.png"
                    alt="EvaraTech"
                    className={`h-[140px] object-contain transition-all duration-800 will-change-[opacity,transform] ${phase === 'in' ? 'opacity-0 scale-[0.8]' : 'opacity-100 scale-100'}`}
                    style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                />
                <img
                    src="/evaratech.png"
                    alt="EvaraTech"
                    className={`h-[50px] w-auto object-contain transition-all duration-800 delay-100 will-change-[opacity,transform] ${phase === 'in' ? 'opacity-0 scale-[0.8] translate-y-5' : 'opacity-100 scale-100 translate-y-0'}`}
                    style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                />
            </div>
        </div>
    );
};

export default SplashScreen;
