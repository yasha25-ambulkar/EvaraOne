import { useState } from 'react';
import { Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole, UserPlan } from '../context/AuthContext';

/**
 * RolePreviewButton - Allows super admins to preview the application as different user roles
 * This helps administrators test the user experience for different permission levels
 */
export const RolePreviewButton = () => {
    const { user, setUser } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [originalUser, setOriginalUser] = useState<typeof user>(null);

    // Only show for super admins
    if (user?.role !== 'superadmin') return null;

    const previewOptions = [
        { role: 'customer' as UserRole, plan: 'base' as UserPlan, label: 'Customer (Base)' },
        { role: 'customer' as UserRole, plan: 'plus' as UserPlan, label: 'Customer (Plus)' },
        { role: 'customer' as UserRole, plan: 'pro' as UserPlan, label: 'Customer (Pro)' },
        { role: 'distributor' as UserRole, label: 'Distributor' },
    ];

    const handlePreviewMode = (option: typeof previewOptions[0] | null) => {
        if (!isPreviewMode && option) {
            // Store original user and enter preview mode
            setOriginalUser(user);
            setUser({
                ...user,
                role: option.role,
                plan: option.plan || user.plan,
                _previewMode: true,
                _originalRole: user.role
            } as any);
            setIsPreviewMode(true);
        } else {
            // Exit preview mode
            if (originalUser) {
                setUser(originalUser);
            }
            setOriginalUser(null);
            setIsPreviewMode(false);
        }
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`px-3 py-1.5 ${isPreviewMode ? 'bg-green-100 hover:bg-green-200 text-green-700 border-green-200' : 'bg-orange-100 hover:bg-orange-200 text-orange-700 border-orange-200'} text-xs font-bold rounded-lg flex items-center gap-2 transition-all border`}
            >
                <Eye size={14} />
                {isPreviewMode ? 'Preview Active' : 'Preview Mode'}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40 cursor-pointer" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute right-0 top-full mt-2 w-48 apple-glass-card rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                        <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                            {isPreviewMode ? 'Exit Preview' : 'Preview as Role'}
                        </div>
                        {isPreviewMode ? (
                            <button
                                onClick={() => handlePreviewMode(null)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-white/30 transition-colors text-red-600 font-medium"
                            >
                                Exit Preview Mode
                            </button>
                        ) : (
                            previewOptions.map((option) => (
                                <button
                                    key={`${option.role}-${option.plan || 'default'}`}
                                    onClick={() => handlePreviewMode(option)}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-white/30 transition-colors text-slate-700 font-medium"
                                >
                                    {option.label}
                                </button>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
