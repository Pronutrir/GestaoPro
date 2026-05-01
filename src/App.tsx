import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./legacy/pages/Login";
import Overview from "./legacy/pages/PipelineTiposTest";
import Dashboard from "./legacy/pages/Dashboard";
import ProjectDetails from "./legacy/pages/ProjectDetails";
import Setup from "./legacy/pages/Setup";
import BlockedProjects from "./legacy/pages/BlockedProjects";
import TeamView from "./legacy/pages/TeamView";
import Reports from "./legacy/pages/Reports";
import Settings from "./legacy/pages/Settings";
import Timeline from "./legacy/pages/Timeline";
import Roadmap from "./legacy/pages/Roadmap";
import Investments from "./legacy/pages/Investments";
import CSC from "./legacy/pages/CSC";
import QualityManagement from "./legacy/pages/QualityManagement";
import OKRs from "./legacy/pages/OKRs";
import Calendario from "./legacy/pages/Calendario";
import Trash from "./legacy/pages/Trash";
import NotFound from "./legacy/pages/NotFound";
import DocumentoTest from "./legacy/pages/DocumentoTest";
import TarefasTest from "./legacy/pages/TarefasTest";
import CronogramaTest from "./legacy/pages/CronogramaTest";
import ProjectCronogramaTest from "./legacy/pages/ProjectCronogramaTest";
import CronogramaGeralTest from "./legacy/pages/CronogramaGeralTest";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
            <Route path="/roadmap" element={<ProtectedRoute gestorOnly><Roadmap /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/project/:id" element={<ProtectedRoute><ProjectDetails /></ProtectedRoute>} />
            <Route path="/blocked-projects" element={<ProtectedRoute><BlockedProjects /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><TeamView /></ProtectedRoute>} />
            <Route path="/timeline" element={<ProtectedRoute><Timeline /></ProtectedRoute>} />
            <Route path="/investments" element={<ProtectedRoute gestorOnly><Investments /></ProtectedRoute>} />
            <Route path="/csc" element={<ProtectedRoute gestorOnly><CSC /></ProtectedRoute>} />
            <Route path="/qualidade" element={<ProtectedRoute><QualityManagement /></ProtectedRoute>} />
            <Route path="/okrs" element={<ProtectedRoute gestorOnly><OKRs /></ProtectedRoute>} />
            <Route path="/calendario" element={<ProtectedRoute><Calendario /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute gestorOnly><Reports /></ProtectedRoute>} />
            <Route path="/trash" element={<ProtectedRoute><Trash /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
            <Route path="/documento-test" element={<ProtectedRoute><DocumentoTest /></ProtectedRoute>} />
            <Route path="/tarefas-test" element={<ProtectedRoute><TarefasTest /></ProtectedRoute>} />
            <Route path="/cronograma-test" element={<ProtectedRoute><CronogramaTest /></ProtectedRoute>} />
            <Route path="/cronograma-geral-test" element={<ProtectedRoute><CronogramaGeralTest /></ProtectedRoute>} />
            <Route path="/project/:id/cronograma-test" element={<ProtectedRoute><ProjectCronogramaTest /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
