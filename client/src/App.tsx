import React, { useState, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './layouts/AdminLayout';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { TenancyProvider } from './context/TenancyContext';
import { ToastProvider } from './components/ToastProvider';
import SplashScreen from './components/ui/SplashScreen';

// ── Lazy-loaded page components (code splitting) ──────────────────────
const Login = React.lazy(() => import('./pages/Login'));
const Home = React.lazy(() => import('./pages/Home'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const SuperAdminDashboard = React.lazy(() => import('./pages/SuperAdminDashboard'));
const CustomerDashboard = React.lazy(() => import('./pages/CustomerDashboard'));
const AllNodes = React.lazy(() => import('./pages/AllNodes'));
const Admin = React.lazy(() => import('./pages/Admin'));
const NodeDetails = React.lazy(() => import('./pages/NodeDetails'));
const EvaraTankAnalytics = React.lazy(() => import('./pages/EvaraTankAnalytics'));
const EvaraDeepAnalytics = React.lazy(() => import('./pages/EvaraDeepAnalytics'));
const EvaraFlowAnalytics = React.lazy(() => import('./pages/EvaraFlowAnalytics'));
const EvaraTDSAnalytics = React.lazy(() => import('./pages/EvaraTDSAnalytics'));
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard'));
const AdminCustomers = React.lazy(() => import('./pages/admin/AdminCustomers'));
const ConfigureNode = React.lazy(() => import('./pages/ConfigureNode'));
const ConfigureFlow = React.lazy(() => import('./pages/ConfigureFlow'));

const CustomerDetails = React.lazy(() => import('./pages/admin/hierarchy/CustomerDetails'));
const ZonesOverview = React.lazy(() => import('./pages/admin/hierarchy/ZonesOverview'));

const ZoneCustomers = React.lazy(() => import('./pages/admin/hierarchy/ZoneCustomers'));
const AdminConfig = React.lazy(() => import('./pages/admin/AdminConfig'));

// ── Loading fallback for Suspense ─────────────────────────────────────
const PageLoader = () => (
    <div className="flex items-center justify-center w-full h-screen">
        <div className="w-8 h-8 border-[3px] border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
    </div>
);

// Create a client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 10, // 10 minutes (Data stays fresh — saves Firestore reads)
            gcTime: 1000 * 60 * 30, // 30 minutes (Cache garbage collection)
            retry: 1,
            refetchOnWindowFocus: false, // Prevent multiple fetches on tab switch
        },
    },
});

const GlobalBackground = ({ children }: { children: React.ReactNode }) => {
    const location = useLocation();
    const isMap = location.pathname.startsWith('/map');
    return (
        <div className={isMap ? '' : 'app-global-bg'}>
            {!isMap && (
                <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                    <div className="absolute inset-0 backdrop-blur-[0px] dark:backdrop-blur-none z-0"></div>
                </div>
            )}
            <div className="relative z-10 w-full min-h-screen">
                {children}
            </div>
        </div>
    );
};

function App() {
    const [splashDone, setSplashDone] = useState(false);


    return (
        <QueryClientProvider client={queryClient}>
            {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
            {splashDone && (
                <AuthProvider>
                    <TenancyProvider>
                        <ToastProvider>
                            <Router>
                                <GlobalBackground>
                                    <Suspense fallback={<PageLoader />}>
                                        <Routes>
                                            <Route path="/" element={<Navigate to="/login" replace />} />
                                            <Route path="/login" element={<Login />} />

                                            <Route element={<ProtectedRoute />}>
                                                <Route element={<MainLayout />}>
                                                    <Route path="/map" element={<Home />} />
                                                    <Route path="/dashboard" element={<Dashboard />} />
                                                    <Route path="/nodes" element={<AllNodes />} />
                                                    <Route path="/node/:id" element={<NodeDetails />} />
                                                    <Route path="/configure/:id" element={<ConfigureNode />} />
                                                    <Route path="/configure-flow/:id" element={<ConfigureFlow />} />
                                                    <Route path="/evaratank" element={<EvaraTankAnalytics />} />
                                                    <Route path="/evaratank/:hardwareId" element={<EvaraTankAnalytics />} />
                                                    <Route path="/evaradeep" element={<EvaraDeepAnalytics />} />
                                                    <Route path="/evaradeep/:hardwareId" element={<EvaraDeepAnalytics />} />
                                                    <Route path="/evaraflow" element={<EvaraFlowAnalytics />} />
                                                    <Route path="/evaraflow/:hardwareId" element={<EvaraFlowAnalytics />} />
                                                    <Route path="/evaratds/:id" element={<EvaraTDSAnalytics />} />
                                                    <Route path="/admin" element={<Admin />} />
                                                </Route>

                                                {/* Admin Routes (Super Admin) */}
                                                <Route element={<ProtectedRoute allowedRoles={['superadmin']} />}>
                                                    <Route path="/superadmin" element={<AdminLayout />}>
                                                        <Route index element={<Navigate to="/superadmin/dashboard" replace />} />
                                                        <Route path="dashboard" element={<AdminDashboard />} />
                                                        <Route path="customers" element={<AdminCustomers />} />

                                                        {/* Hierarchy Routes */}
                                                        <Route path="zones" element={<ZonesOverview />} />

                                                        <Route path="customers/:customerId" element={
                                                            <ErrorBoundary>
                                                                <CustomerDetails />
                                                            </ErrorBoundary>
                                                        } />
                                                        <Route path="zones/:regionId/customers" element={<ZoneCustomers />} />

                                                        {/* Legacy route redirects or keep if needed */}
                                                        <Route path="nodes" element={<Navigate to="zones" replace />} />

                                                        <Route path="config" element={<AdminConfig />} />
                                                    </Route>
                                                </Route>
                                            </Route>

                                            {/* Catch-all redirect to Map */}
                                        </Routes>
                                    </Suspense>
                                </GlobalBackground>
                            </Router>
                        </ToastProvider>
                    </TenancyProvider>
                </AuthProvider>
            )}
        </QueryClientProvider>
    );
}

export default App;
