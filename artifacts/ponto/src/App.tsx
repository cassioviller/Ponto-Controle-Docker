import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Resumo from "@/pages/Resumo";
import Consolidado from "@/pages/Consolidado";
import FolhaIndividual from "@/pages/FolhaIndividual";
import BaterPonto from "@/pages/BaterPonto";
import Funcionarios from "@/pages/Funcionarios";
import Login from "@/pages/Login";
import SuperAdmin from "@/pages/SuperAdmin";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !user && location !== "/login") {
      navigate("/login", { replace: true });
    }
  }, [user, loading, location, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[#5C6E84]">Carregando...</div>;
  }
  if (!user) return null;
  return <>{children}</>;
}

function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[#5C6E84]">Carregando...</div>;
  }
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "super_admin") return <Redirect to="/" />;
  return <>{children}</>;
}

function TenantApp() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Resumo} />
        <Route path="/consolidado" component={Consolidado} />
        <Route path="/funcionario/:id" component={FolhaIndividual} />
        <Route path="/bater-ponto" component={BaterPonto} />
        <Route path="/funcionarios" component={Funcionarios} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Router() {
  const { user, loading } = useAuth();

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/super-admin">
        <RequireSuperAdmin>
          <SuperAdmin />
        </RequireSuperAdmin>
      </Route>
      <Route>
        <RequireAuth>
          {user?.role === "super_admin" && !loading ? (
            <Redirect to="/super-admin" />
          ) : (
            <TenantApp />
          )}
        </RequireAuth>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
