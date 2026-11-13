import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PrecosPage } from "./pages/PrecosPage";
import { HistoricoPage } from "./pages/HistoricoPage";
import { CompararPage } from "./pages/CompararPage";
import { TemaProvider } from "./lib/tema";

export function App() {
  return (
    <TemaProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<PrecosPage />} />
          <Route path="historico" element={<HistoricoPage />} />
          <Route path="comparar" element={<CompararPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </TemaProvider>
  );
}
