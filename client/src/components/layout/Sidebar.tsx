import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Map,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { logout } = useAuth();

  const menuItems = [
    { path: "/superadmin/dashboard", icon: LayoutDashboard, label: "Overview" },
    { path: "/superadmin/customers", icon: Users, label: "Customers" },
    { path: "/superadmin/zones", icon: Map, label: "Zones & Zones" },
    { path: "/superadmin/config", icon: Settings, label: "System Config" },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <aside
      className={`
                relative bg-white/10 backdrop-blur-2xl border-r border-white/20 flex flex-col transition-all duration-300
                ${collapsed ? "w-20" : "w-64"}
            `}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-8 bg-white/40 backdrop-blur-md border border-white/60 text-slate-500 rounded-full p-1 hover:text-blue-600 hover:shadow-lg transition-all z-50 shadow-md"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Logo Area */}
      <div className="h-16 flex items-center justify-center border-b border-white/10">
        {collapsed ? (
          <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 text-transparent bg-clip-text">
            E
          </span>
        ) : (
          <span className="text-xl font-bold text-slate-800 tracking-widest">
            EVARA<span className="text-[#3A7AFE]">ADMIN</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-2">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`
                            flex items-center gap-3 px-3 py-3 rounded-xl transition-all group
                            ${
                              isActive(item.path)
                                ? "bg-blue-600/10 text-blue-600 shadow-sm border border-blue-600/20"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/20"
                            }
                        `}
          >
            <item.icon
              size={20}
              className={
                isActive(item.path)
                  ? "text-blue-600"
                  : "text-slate-400 group-hover:text-blue-500"
              }
            />
            {!collapsed && (
              <span className="font-medium text-sm">{item.label}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* User Profile / Logout */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={logout}
          className={`
                        w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors
                        ${collapsed ? "justify-center" : ""}
                    `}
        >
          <LogOut size={20} />
          {!collapsed && <span className="font-bold text-sm">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
