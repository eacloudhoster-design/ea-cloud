import { PrivacyProvider } from "./privacy/PrivacyProvider";
import Legal from "./pages/Legal";
import ClientStartup from "./components/ClientStartup";
import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { ClientAuthProvider } from "./contexts/ClientAuthContext";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { useAuth } from "./contexts/AuthContext";
import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { AdminSidebar } from "./components/layout/AdminSidebar";
import { SuperAdminSidebar } from "./components/layout/SuperAdminSidebar";
import Landing from "./pages/Landing";
import Register from "./pages/Register";
import AdminLogin from "./pages/admin/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import SetupMethod from "./pages/admin/SetupMethod";
import AdminProfile from "./pages/admin/Profile";
import AdminLicenses from "./pages/admin/Licenses";
import AdminClients from "./pages/admin/Clients";
import AdminSettings from "./pages/admin/Settings";
import EAManager from "./pages/admin/EAManager";
import Mt5Connections from "./pages/admin/Mt5Connections";
import ScannerManagement from "./pages/superadmin/ScannerManagement";
import SuperAdminLogin from "./pages/superadmin/Login";
import SuperAdminDashboard from "./pages/superadmin/Dashboard";
import SuperAdminMentors from "./pages/superadmin/Mentors";
import SuperAdminAppAccess from "./pages/superadmin/AppAccess";
import SuperAdminLicenses from "./pages/superadmin/Licenses";
import SuperAdminSettings from "./pages/superadmin/Settings";
import SuperAdminBrokerServers from "./pages/superadmin/BrokerServers";
import SuperAdminSignalQueue from "./pages/superadmin/SignalQueue";
import AppLogin from "./pages/app/Login";
import AppSubscribe from "./pages/app/Subscribe";
import AppPending from "./pages/app/Pending";
import AppActivate from "./pages/app/Activate";
import AppDashboard from "./pages/app/Dashboard";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function AdminLayout({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { data: profile } = useGetProfile({ query: { queryKey: getGetProfileQueryKey(), enabled: !!token } });
  const bgImage = profile?.backgroundImageUrl;
  return (
    <div
      className="min-h-screen text-white relative"
      style={bgImage ? {
        backgroundImage: `url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      } : { background: "#080810" }}
    >
      {bgImage && <div className="fixed inset-0 bg-[#080810]/80 backdrop-blur-[2px] pointer-events-none z-0" />}
      <AdminSidebar />
      <main className="md:ml-56 min-h-screen relative z-10">{children}</main>
    </div>
  );
}

function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-white" style={{ background: "#08080f" }}>
      <SuperAdminSidebar />
      <main className="md:ml-56 min-h-screen">{children}</main>
    </div>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080810] text-white">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClientAuthProvider>
          <PrivacyProvider>
          <ClientStartup>
          <div className="dark">
            <Switch>
              {/* ── Client App Portal ── */}
              <Route path="/app" component={AppLogin} />
              <Route path="/app/subscribe" component={AppSubscribe} />
              <Route path="/app/pending" component={AppPending} />
              <Route path="/app/activate" component={AppActivate} />
              <Route path="/app/dashboard" component={AppDashboard} />

              {/* ── Super Admin Portal ── */}
              <Route path="/superadmin/login" component={SuperAdminLogin} />
              <Route path="/superadmin/dashboard">
                <SuperAdminLayout><SuperAdminDashboard /></SuperAdminLayout>
              </Route>
              <Route path="/superadmin/mentors">
                <SuperAdminLayout><SuperAdminMentors /></SuperAdminLayout>
              </Route>
              <Route path="/superadmin/app-access">
                <SuperAdminLayout><SuperAdminAppAccess /></SuperAdminLayout>
              </Route>
              <Route path="/superadmin/scanner"><SuperAdminLayout><ScannerManagement /></SuperAdminLayout></Route>
              <Route path="/superadmin/licenses">
                <SuperAdminLayout><SuperAdminLicenses /></SuperAdminLayout>
              </Route>
              <Route path="/superadmin/brokers">
                <SuperAdminLayout><SuperAdminBrokerServers /></SuperAdminLayout>
              </Route>
              <Route path="/superadmin/signal-queue">
                <SuperAdminLayout><SuperAdminSignalQueue /></SuperAdminLayout>
              </Route>
              <Route path="/superadmin/settings">
                <SuperAdminLayout><SuperAdminSettings /></SuperAdminLayout>
              </Route>

              {/* ── Mentor Admin Portal ── */}
              <Route path="/admin/login" component={AdminLogin} />
              <Route path="/admin/dashboard">
                <AdminLayout><AdminDashboard /></AdminLayout>
              </Route>
              <Route path="/admin/setup">
                <AdminLayout><SetupMethod /></AdminLayout>
              </Route>
              <Route path="/admin/profile">
                <AdminLayout><AdminProfile /></AdminLayout>
              </Route>
              <Route path="/admin/licenses">
                <AdminLayout><AdminLicenses /></AdminLayout>
              </Route>
              <Route path="/admin/clients">
                <AdminLayout><AdminClients /></AdminLayout>
              </Route>
              <Route path="/admin/ea-manager">
                <AdminLayout><EAManager /></AdminLayout>
              </Route>
              <Route path="/admin/mt5-connections">
                <AdminLayout><Mt5Connections /></AdminLayout>
              </Route>
              <Route path="/admin/settings">
                <AdminLayout><AdminSettings /></AdminLayout>
              </Route>

              {/* ── Public Pages ── */}
              <Route path="/legal/:page">{params => <PublicLayout><Legal page={params.page}/></PublicLayout>}</Route>
              <Route path="/legal"><PublicLayout><Legal/></PublicLayout></Route>
              <Route path="/register">
                <PublicLayout><Register /></PublicLayout>
              </Route>
              <Route path="/">
                <PublicLayout><Landing /></PublicLayout>
              </Route>

              <Route component={NotFound} />
            </Switch>
          </div>
          </ClientStartup>
          </PrivacyProvider>
        </ClientAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
