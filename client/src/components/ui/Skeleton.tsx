export default function Skeleton({ className }: { className?: string }) {
    return (
        <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`}></div>
    );
}

export function CardSkeleton() {
    return (
        <div className="apple-glass-card rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
            <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-4 w-32" />
        </div>
    );
}

export function TableRowSkeleton() {
    return (
        <div className="flex items-center space-x-4 py-4 border-b border-slate-50">
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-1/6 ml-auto" />
        </div>
    );
}
