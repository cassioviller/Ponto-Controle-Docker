import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { setEmpresaId } from "@workspace/api-client-react";
import { baseUrl } from "@/lib/utils";

export interface Empresa {
  id: number;
  nome: string;
  cnpj: string | null;
  slug: string;
  plano: string;
  ativo: boolean;
  criado_em: string;
}

interface EmpresaContextValue {
  empresa: Empresa | null;
  empresas: Empresa[];
  setEmpresa: (e: Empresa) => void;
  loading: boolean;
}

const EmpresaContext = createContext<EmpresaContextValue>({
  empresa: null,
  empresas: [],
  setEmpresa: () => {},
  loading: true,
});

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresa, setEmpresaState] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = baseUrl();
    fetch(`${base}/api/empresas`)
      .then((r) => r.json())
      .then((data: Empresa[]) => {
        setEmpresas(data);
        if (data.length > 0) {
          const first = data[0]!;
          setEmpresaState(first);
          setEmpresaId(first.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function setEmpresa(e: Empresa) {
    setEmpresaState(e);
    setEmpresaId(e.id);
  }

  return (
    <EmpresaContext.Provider value={{ empresa, empresas, setEmpresa, loading }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export function useEmpresa() {
  return useContext(EmpresaContext);
}
