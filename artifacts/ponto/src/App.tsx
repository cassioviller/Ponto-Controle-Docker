import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Resumo from "@/pages/Resumo";
import Consolidado from "@/pages/Consolidado";
import FolhaIndividual from "@/pages/FolhaIndividual";
import BaterPonto from "@/pages/BaterPonto";
import Funcionarios from "@/pages/Funcionarios";
import NotFound from "@/pages/not-found";
import { EmpresaProvider } from "@/contexts/EmpresaContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <EmpresaProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </EmpresaProvider>
    </QueryClientProvider>
  );
}

export default App;
