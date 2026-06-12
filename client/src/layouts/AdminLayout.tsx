import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, Database, Settings,
    LogOut, Menu, Shield, ChevronRight, ChevronLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import Navbar from '../components/layout/Navbar';

const AdminLayout = () => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile sidebar state
    const [isCollapsed, setIsCollapsed] = useState(true); // Desktop collapse state

    const navItems = [
        { name: 'Dashboard', path: '/superadmin/dashboard', icon: LayoutDashboard },
        { name: 'Customers', path: '/superadmin/customers', icon: Users },
        { name: 'Zones', path: '/superadmin/zones', icon: Database },
        { name: 'System Config', path: '/superadmin/config', icon: Settings },
    ];

    return (
        <div className="min-h-screen flex flex-col font-sans text-[var(--text-primary)] bg-transparent">
            <Navbar />

            <div className="flex-1 flex overflow-hidden">
                {/* ─── LEFT SIDEBAR ─── */}
                <aside
                    className={`
                        fixed inset-y-0 left-0 z-50 apple-glass-card rounded-none border-r border-[var(--card-border)] transition-all duration-300 ease-in-out flex flex-col
                        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                        md:relative md:translate-x-0 md:mt-[110px] md:mb-6 md:ml-6 md:rounded-[32px] md:border md:shadow-[0_12px_40px_rgba(0,0,0,0.08)] md:h-[calc(100vh-134px)]
                        ${isCollapsed ? 'w-[88px]' : 'w-[260px]'}
                    `}
                >

                    {/* Logo Area */}
                    <div className={`h-16 flex items-center border-b border-[var(--card-border)] ${isCollapsed ? 'justify-center px-0' : 'px-6 gap-3'}`}>
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                            <Shield size={18} className="text-white" />
                        </div>
                        {!isCollapsed && (
                            <div className="overflow-hidden">
                                <h1 className="text-base font-bold text-[var(--text-primary)] tracking-wide uppercase">
                                    Super Admin
                                </h1>
                                <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wider truncate">
                                    Global Command
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Floating Toggle Removed */}

                    {/* Navigation */}
                    <nav className="p-4 space-y-1">
                        {navItems.map(item => {
                            const isActive = location.pathname === item.path;
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    title={isCollapsed ? item.name : undefined}
                                    className={`
                                        flex items-center rounded-[12px] text-[13px] font-[600] transition-all group
                                        ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'}
                                        ${isActive
                                            ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(58,122,254,0.3)]'
                                            : 'text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'}
                                    `}
                                >
                                    <item.icon size={18} className={isActive ? 'text-white' : 'text-[var(--text-muted)] group-hover:text-blue-500'} />
                                    {!isCollapsed && (
                                        <>
                                            <span className="truncate">{item.name}</span>
                                            {isActive && <ChevronRight size={14} className="ml-auto opacity-50 shrink-0" />}
                                        </>
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Bottom Profile & Toggle */}
                    <div className="mt-auto p-4 border-t border-[var(--card-border)] bg-black/5 dark:bg-white/5 backdrop-blur-md md:rounded-b-[32px]">
                        {!isCollapsed ? (
                            <>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                                        <span className="text-[14px] font-[700] text-blue-500">{user?.displayName?.[0]}</span>
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-[13px] font-[600] text-[var(--text-primary)] truncate">{user?.displayName}</p>
                                        <p className="text-[10px] text-[var(--text-muted)] font-[500] truncate">{user?.email}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={logout}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-[12px] border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.05)] text-[12px] font-[700] text-[#EF4444] hover:bg-[#EF4444] hover:text-white transition-all shadow-sm"
                                    >
                                        <LogOut size={14} /> EXIT
                                    </button>
                                    <button
                                        onClick={() => setIsCollapsed(true)}
                                        className="hidden md:flex w-9 h-9 shrink-0 items-center justify-center rounded-[12px] border border-[var(--card-border)] bg-black/5 dark:bg-white/5 text-[var(--text-muted)] hover:bg-black/10 dark:hover:bg-white/10 hover:text-blue-500 transition-all shadow-sm"
                                        title="Collapse Sidebar"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0" title={user?.displayName}>
                                    <span className="text-[14px] font-[700] text-blue-500">{user?.displayName?.[0]}</span>
                                </div>
                                <button
                                    onClick={logout}
                                    className="w-9 h-9 flex items-center justify-center rounded-[12px] border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.05)] text-[#EF4444] hover:bg-[#EF4444] hover:text-white transition-all shadow-sm"
                                    title="Exit Console"
                                >
                                    <LogOut size={14} />
                                </button>
                                <button
                                    onClick={() => setIsCollapsed(false)}
                                    className="hidden md:flex w-9 h-9 items-center justify-center rounded-[12px] border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm mt-1"
                                    title="Expand Sidebar"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </aside>

                {/* ─── MAIN CONTENT ─── */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Mobile Header */}
                    <header className="h-16 md:hidden flex items-center justify-between px-4 apple-glass-card rounded-none border-b border-[var(--card-border)]">
                        <button onClick={() => setSidebarOpen(true)} className="text-[var(--text-primary)]">
                            <Menu size={24} />
                        </button>
                        <span className="font-[700] text-[var(--text-primary)]">Admin Console</span>
                        <div className="w-6" /> {/* Spacer */}
                    </header>

                    {/* Backdrop for mobile */}
                    {sidebarOpen && (
                        <div
                            className="fixed inset-0 bg-black/20 z-40 md:hidden"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}

                    {/* Content Area */}
                    <main className="flex-1 overflow-y-auto p-4 md:p-8 md:pt-[120px] relative">
                        <Outlet />
                    </main>
                </div>


            </div>
        </div>
    );
};

export default AdminLayout;
