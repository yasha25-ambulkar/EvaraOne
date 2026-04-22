import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  Shield,
  Users,
  ArrowLeft,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types/database_custom";

type Mode = "signin" | "register";
type LoginStep = "role-selection" | "credentials";

const Login = () => {
  // ─── State ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState<LoginStep>("role-selection");
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { login: loginFn, signup: signupFn, user, isAuthenticated } = useAuth();

  // If already logged in, redirect away from login page
  if (isAuthenticated && user) {
    return <Navigate to="/map" replace />;
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setStep("credentials");
    setError("");
    // Pre-fill email for demo convenience if desired, or leave blank
    if (role === "superadmin") setEmail("ritik@evaratech.com");
    else setEmail("");
  };

  const handleBack = () => {
    setStep("role-selection");
    setSelectedRole(null);
    setError("");
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const timeoutPromise = new Promise<{ timeout: true }>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error("Request timed out. Please check your connection.")),
        10000,
      ),
    );

    try {
      if (mode === "signin") {
        // Race login against timeout
        const result = (await Promise.race([
          loginFn(email, password),
          timeoutPromise,
        ])) as Awaited<ReturnType<typeof loginFn>>;

        if (result.success && result.user) {
          // Redirect all users to the Map page as requested
          navigate("/map");
        } else {
          setError(result.error ?? "Invalid credentials.");
        }
      } else {
        if (!displayName.trim()) {
          setError("Please enter your name.");
          setIsLoading(false);
          return;
        }
        const result = (await Promise.race([
          signupFn(email, password, displayName.trim()),
          timeoutPromise,
        ])) as Awaited<ReturnType<typeof signupFn>>;

        if (result.success) {
          navigate("/map");
        } else {
          setError(result.error ?? "Registration failed.");
        }
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render: Role Selection ──────────────────────────────────────────────

  if (step === "role-selection") {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center p-6 bg-[#f8fafc] overflow-hidden">
        {/* Modern Mesh Gradient Background Layer */}
        <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[70%] bg-[#4b85f0]/30 rounded-full blur-[120px] pointer-events-none animate-float" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-20%] left-[-10%] w-[70%] h-[70%] bg-[#8fdc4c]/40 rounded-full blur-[120px] pointer-events-none animate-float" style={{ animationDuration: '10s', animationDelay: '1s' }} />

        <div className="text-center mb-12 relative z-10">
          <img
            src="/evara-logo.png"
            alt="EvaraTech"
            className="w-24 h-24 mx-auto mb-6 object-contain"
          />
          <h1 className="text-5xl font-black text-[var(--text-primary)] mb-3 tracking-tight">
            Welcome to EvaraTech
          </h1>
          <p className="text-[var(--text-muted)] text-xl font-medium">
            Select your portal to continue
          </p>
        </div>

        <div className="flex flex-col md:flex-row justify-center gap-10 w-full max-w-6xl relative z-10">
          {/* Super Admin Card */}
          <button
            onClick={() => handleRoleSelect("superadmin")}
            className="group apple-glass-card p-10 rounded-[2.5rem] bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.06)] hover:shadow-[0_30px_60px_rgba(58,122,254,0.15)] hover:border-blue-400/50 transition-all duration-500 text-left relative overflow-hidden min-h-[360px] w-full md:w-[420px] flex flex-col justify-end"
          >
            <div className="absolute top-4 right-4 p-4 opacity-10 group-hover:opacity-30 group-hover:scale-110 transition-all duration-500">
              <Shield size={160} className="text-[#3A7AFE]" />
            </div>
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-8 text-[#3A7AFE] group-hover:scale-110 transition-transform duration-500 border border-blue-500/20">
              <Shield size={32} strokeWidth={2.5} />
            </div>
            <h3 className="text-2xl font-black text-[var(--text-primary)] mb-3 group-hover:text-[#3A7AFE] transition-colors">
              Super Admin
            </h3>
            <p className="text-base text-[var(--text-muted)] font-medium leading-relaxed opacity-80 group-hover:opacity-100">
              Full system control, user management, and global analytics.
            </p>
          </button>

          {/* Customer Card */}
          <button
            onClick={() => handleRoleSelect("customer")}
            className="group apple-glass-card p-10 rounded-[2.5rem] bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.06)] hover:shadow-[0_30px_60px_rgba(34,197,94,0.15)] hover:border-green-400/50 transition-all duration-500 text-left relative overflow-hidden min-h-[360px] w-full md:w-[420px] flex flex-col justify-end"
          >
            <div className="absolute top-4 right-4 p-4 opacity-10 group-hover:opacity-30 group-hover:scale-110 transition-all duration-500">
              <Users size={160} className="text-green-500" />
            </div>
            <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-8 text-green-500 group-hover:scale-110 transition-transform duration-500 border border-green-500/20">
              <Users size={32} strokeWidth={2.5} />
            </div>
            <h3 className="text-2xl font-black text-[var(--text-primary)] mb-3 group-hover:text-green-500 transition-colors">
              Customer
            </h3>
            <p className="text-base text-[var(--text-muted)] font-medium leading-relaxed opacity-80 group-hover:opacity-100">
              Monitor your water usage, view status, and receive alerts.
            </p>
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Credentials Form ────────────────────────────────────────────

  const isSuperAdmin = selectedRole === "superadmin";

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-[#f8fafc] overflow-hidden">
      {/* Modern Mesh Gradient Background Layer */}
      <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[70%] bg-[#4b85f0]/30 rounded-full blur-[120px] pointer-events-none animate-float" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-20%] left-[-10%] w-[70%] h-[70%] bg-[#8fdc4c]/40 rounded-full blur-[120px] pointer-events-none animate-float" style={{ animationDuration: '10s', animationDelay: '1s' }} />

      <div className="w-full max-w-lg relative z-10">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-6 font-medium transition-colors"
        >
          <ArrowLeft size={18} /> Back to Role Selection
        </button>

        <div className="text-center mb-8">
          <div
            className={clsx(
              "w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4",
              selectedRole === "superadmin"
                ? "bg-blue-100 text-blue-600"
                : "bg-green-100 text-green-600",
            )}
          >
            {selectedRole === "superadmin" ? (
              <Shield size={32} />
            ) : (
              <Users size={32} />
            )}
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] capitalize">
            {selectedRole} Login
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Enter your credentials to access the dashboard
          </p>
        </div>

        <div className="apple-glass-card rounded-[2rem] bg-white/40 dark:bg-white/5 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-white/60 overflow-hidden">
          {/* Tab Switcher (Only for non-superadmin, or if you want to allow registration) */}
          {!isSuperAdmin && (
            <div className="flex border-b border-slate-100">
              <button
                onClick={() => switchMode("signin")}
                className={clsx(
                  "flex-1 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2",
                  mode === "signin"
                    ? "text-[#3A7AFE] border-b-2 border-[#3A7AFE] bg-blue-500/10"
                    : "text-[var(--text-muted)]",
                )}
              >
                <LogIn size={16} /> Sign In
              </button>
              <button
                onClick={() => switchMode("register")}
                className={clsx(
                  "flex-1 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2",
                  mode === "register"
                    ? "text-green-500 border-b-2 border-green-500 bg-green-500/10"
                    : "text-[var(--text-muted)]",
                )}
              >
                <UserPlus size={16} /> Create Account
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {mode === "register" && !isSuperAdmin && (
              <div>
                <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide mb-2 opacity-70">
                  Full Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] apple-glass-inner text-[var(--text-primary)] text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium placeholder:text-[var(--text-muted)]/50"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide mb-2 opacity-70">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] apple-glass-inner text-[var(--text-primary)] text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium placeholder:text-[var(--text-muted)]/50"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide mb-2 opacity-70">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] apple-glass-inner text-[var(--text-primary)] text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium pr-12 placeholder:text-[var(--text-muted)]/50"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium border border-red-100 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={clsx(
                "w-full py-[10px] rounded-[14px] text-white font-extrabold text-[12px] flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 tracking-[0.5px] uppercase",
                isSuperAdmin
                  ? "bg-[#3A7AFE] shadow-[0_8px_16px_-4px_rgba(58,122,254,0.4)]"
                  : selectedRole === "customer" 
                    ? "bg-[#22c55e] shadow-[0_8px_16px_-4px_rgba(34,197,94,0.4)]"
                    : "bg-[#3A7AFE] shadow-[0_8px_16px_-4px_rgba(58,122,254,0.4)]"
              )}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === "signin" ? (
                    <LogIn size={18} />
                  ) : (
                    <UserPlus size={18} />
                  )}
                  {mode === "signin"
                    ? "Sign In to Dashboard"
                    : "Create Account"}
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-8 font-medium">
          Protected by EvaraTech Secure Access • © 2025
        </p>
      </div>
    </div>
  );
};

export default Login;
