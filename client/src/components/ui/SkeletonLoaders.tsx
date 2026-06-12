/**
 * Phase 30: UX Polish - Skeleton Loading Components
 * Premium skeleton screens for a polished loading experience.
 * Replaces plain spinners with content-aware placeholders.
 */
import React from 'react';

interface SkeletonProps {
    className?: string;
    width?: string;
    height?: string;
    rounded?: boolean;
}

export const SkeletonPulse: React.FC<SkeletonProps> = ({
    className = '',
    width,
    height,
    rounded = false
}) => (
    <div
        className={`animate-pulse bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] ${rounded ? 'rounded-full' : 'rounded-lg'} ${className}`}
        style={{ width, height }}
    />
);

export const StatCardSkeleton: React.FC = () => (
    <div className="apple-glass-card backdrop-blur-md p-6 rounded-2xl shadow-sm border border-white/50 flex flex-col justify-between">
        <div className="flex justify-between items-start">
            <div>
                <SkeletonPulse width="80px" height="14px" className="mb-2" />
                <SkeletonPulse width="60px" height="32px" />
            </div>
            <SkeletonPulse width="44px" height="44px" rounded />
        </div>
        <SkeletonPulse width="120px" height="20px" className="mt-4" />
    </div>
);

export const DeviceRowSkeleton: React.FC = () => (
    <tr className="border-b border-slate-50">
        <td className="px-5 py-4">
            <SkeletonPulse width="140px" height="16px" className="mb-1" />
            <SkeletonPulse width="80px" height="12px" />
        </td>
        <td className="px-5 py-4">
            <div className="flex items-center gap-2">
                <SkeletonPulse width="8px" height="8px" rounded />
                <SkeletonPulse width="60px" height="14px" />
            </div>
        </td>
        <td className="px-5 py-4 text-right">
            <SkeletonPulse width="40px" height="14px" className="ml-auto" />
            <SkeletonPulse width="100%" height="6px" className="mt-1.5" />
        </td>
    </tr>
);

export const MapSkeleton: React.FC = () => (
    <div className="relative h-full w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <SkeletonPulse width="100px" height="14px" className="mx-auto" />
            </div>
        </div>
    </div>
);

export const DashboardSkeleton: React.FC = () => (
    <div className="h-screen flex flex-col p-5 apple-glass-inner font-sans overflow-hidden">
        {/* Header Skeleton */}
        <div className="flex-none flex items-center justify-between mb-5">
            <SkeletonPulse width="280px" height="36px" />
            <div className="flex items-center gap-4">
                <SkeletonPulse width="100px" height="28px" rounded />
                <SkeletonPulse width="200px" height="36px" />
                <SkeletonPulse width="120px" height="28px" />
            </div>
        </div>

        {/* Top Row Skeleton */}
        <div className="flex-none grid grid-cols-12 gap-4 mb-4" style={{ height: '250px' }}>
            <div className="col-span-8 flex flex-col gap-4 h-full">
                <div className="grid grid-cols-4 gap-6">
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                </div>
            </div>
            <div className="col-span-4 h-full">
                <MapSkeleton />
            </div>
        </div>

        {/* Bottom Row Skeleton */}
        <div className="flex-1 min-h-0 grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="apple-glass-card rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-50 flex justify-between items-center">
                        <SkeletonPulse width="150px" height="24px" />
                        <SkeletonPulse width="60px" height="20px" rounded />
                    </div>
                    <div className="flex-1 p-4 space-y-4">
                        {[...Array(4)].map((_, j) => (
                            <SkeletonPulse key={j} width="100%" height="48px" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    </div>
);
