import { useAuth, type AuthEmpresa } from "@/contexts/AuthContext";

// Compatibility shim: keep the old `useEmpresa` API but delegate to AuthContext.
export type Empresa = AuthEmpresa;

export function useEmpresa() {
  const { empresa, empresas, setActiveEmpresa, loading } = useAuth();
  return {
    empresa,
    empresas,
    setEmpresa: setActiveEmpresa,
    loading,
  };
}
