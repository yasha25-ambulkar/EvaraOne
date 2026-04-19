import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, Server, Shield, MapPin, LogOut, Sun, Moon } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useTenancy } from '../context/TenancyContext';

const Navbar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout, isAuthenticated } = useAuth();
    useTenancy(); // Keep hook active for context side-effects if any

    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.setAttribute('data-theme', 'dark');
            root.classList.add('dark');
        } else {
            root.removeAttribute('data-theme');
            root.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    const navItems = [
        { name: 'MAP', path: '/map', icon: MapPin },
        { name: 'DASHBOARD', path: '/dashboard', icon: LayoutGrid },
        { name: 'ALL NODES', path: '/nodes', icon: Server },
        // Show SUPER ADMIN nav only for superadmin role
        ...(user?.role === 'superadmin' ? [{ name: 'SUPER ADMIN', path: '/superadmin', icon: Shield }] : []),
        // Show ADMINISTRATION for community_admin role only (not for customer)
        ...(user?.role === 'community_admin' ? [{ name: 'ADMINISTRATION', path: '/admin', icon: LayoutGrid }] : []),
    ];

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    // Primary palette defined in the new specs




    return (
        <div className="fixed top-2 left-0 right-0 z-[2000] flex justify-center px-4 md:px-12 pointer-events-none">
            <nav className="navbar-glass flex items-center justify-between w-full max-w-[1280px] h-[60px] md:h-[68px] transition-all duration-[220ms] pointer-events-auto">
                {/* Logo Section */}
                <div className="flex items-center gap-[8px] flex-shrink-0">
                    <img src="/evara-logo.png" alt="EvaraTech" className="w-[42px] h-[42px] object-contain" />
                    <span
                        className="text-[22px] font-black hidden lg:block tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#0E79C1] via-[#00A3A6] to-[#2BC872]"
                    >
                        EvaraTech
                    </span>
                </div>

                {/* Nav Items Section */}
                <div className="flex items-center gap-1.5 md:gap-3 flex-nowrap mx-4 flex-1 justify-center min-w-0">
                    {navItems.map((item) => {
                        const isActive = item.path === '/dashboard'
                            ? location.pathname === '/dashboard'
                            : location.pathname.startsWith(item.path);

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={clsx(
                                    "flex items-center gap-2 font-bold tracking-tight text-[13px] md:text-[14px] transition-all cursor-pointer whitespace-nowrap",
                                    isActive ? "navbar-active" : "px-4 py-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 navbar-text"
                                )}
                            >
                                <item.icon
                                    size={18}
                                    strokeWidth={isActive ? 3 : 2}
                                    className={clsx(isActive ? "text-white" : "opacity-70")}
                                />
                                <span className="hidden md:block uppercase">{item.name}</span>
                            </Link>
                        );
                    })}
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                    {/* Theme Toggle Button */}
                    <button
                        onClick={toggleTheme}
                        className="w-[36px] h-[36px] flex items-center justify-center rounded-full transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5 navbar-text"
                        title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                    >
                        {theme === 'light' ? <Moon size={20} strokeWidth={2} /> : <Sun size={20} strokeWidth={2} />}
                    </button>

                    {isAuthenticated && user ? (
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-[40px] h-[40px] rounded-full flex items-center justify-center font-bold text-[16px] bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm border border-white/50"
                                >
                                    {user.displayName[0].toUpperCase()}
                                </div>
                                <div className="hidden lg:flex flex-col">
                                    <span className="text-[14px] font-black tracking-tight leading-none navbar-text">
                                        {user.displayName}
                                    </span>
                                    <span className="text-[9px] font-extrabold uppercase tracking-widest leading-normal text-blue-600 dark:text-blue-400 mt-0.5">
                                        {user.role === 'superadmin' ? 'SUPER ADMIN' :
                                            user.role === 'community_admin' ? 'ADMIN' : 'USER'}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={handleLogout}
                                className="w-[36px] h-[36px] flex items-center justify-center opacity-40 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all duration-200 navbar-text"
                                title="Logout"
                            >
                                <LogOut size={20} strokeWidth={2.5} />
                            </button>
                        </div>
                    ) : (
                        <Link
                            to="/login"
                            className="px-6 py-2.5 rounded-full text-[14px] font-bold tracking-tight transition-all bg-gradient-to-b from-[#3A7AFE] to-[#2563EB] text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Login
                        </Link>
                    )}
                </div>
            </nav>
        </div>
    );
};

export default Navbar;
