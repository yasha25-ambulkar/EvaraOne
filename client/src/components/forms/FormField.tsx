/**
 * FormField — reusable labelled form field with validation error display.
 * Cuts ~12 lines of boilerplate per field in AddDeviceForm.
 */
import { AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
    label: string;
    required?: boolean;
    icon?: LucideIcon;
    error?: string;
    hint?: string;
    className?: string;
    children: React.ReactNode;
}

export const FormField = ({ label, required, icon: Icon, error, hint, className = '', children }: Props) => (
    <div className={className}>
        <label className="flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-slate-400 mb-2">
            {Icon && <Icon size={16} className="text-purple-600 dark:text-purple-400" />}
            {label} {required && '*'}
        </label>
        {children}
        {error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> {error}
            </p>
        )}
        {hint && !error && <p className="text-xs text-[var(--text-muted)] mt-1.5 font-medium">{hint}</p>}
    </div>
);

interface SectionProps {
    title: string;
    icon?: LucideIcon;
    subtitle?: string;
    bordered?: boolean;
    children: React.ReactNode;
}

export const FormSection = ({ title, icon: Icon, subtitle, bordered, children }: SectionProps) => (
    <div className={bordered ? 'border-t pt-6' : ''}>
        <div className="mb-4">
            <h3 className="text-xs font-black text-[var(--modal-heading-color)] uppercase tracking-wider flex items-center gap-2">
                {Icon && <Icon size={14} />} {title}
            </h3>
            {subtitle && <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p>}
        </div>
        {children}
    </div>
);

export default FormField;
