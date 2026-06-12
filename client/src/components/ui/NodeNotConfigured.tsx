// Placeholder shown by analytics pages when a node has no ThingSpeak config yet

interface NodeNotConfiguredProps {
    analyticsType: string;
}

const NodeNotConfigured = ({ analyticsType }: NodeNotConfiguredProps) => (
    <div className="flex flex-col items-center justify-center h-64 text-center p-8">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
            </svg>
        </div>
        <h3 className="text-slate-600 dark:text-slate-300 font-bold text-lg mb-2">
            {analyticsType} — Not Configured
        </h3>
        <p className="text-slate-400 dark:text-slate-500 text-sm max-w-xs leading-relaxed">
            No sensor data is configured for this node yet.
            Contact EvaraTech to enable live monitoring.
        </p>
    </div>
);

export default NodeNotConfigured;
