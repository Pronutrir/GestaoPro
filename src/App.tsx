import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Dashboard from "./pages/Dashboard";
import ProjectDetails from "./pages/ProjectDetails";
import Setup from "./pages/Setup";
import BlockedProjects from "./pages/BlockedProjects";
import TeamView from "./pages/TeamView";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Timeline from "./pages/Timeline";
import Roadmap from "./pages/Roadmap";
import Investments from "./pages/Investments";
import CSC from "./pages/CSC";
import NotFound from "./pages/NotFound";

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
            <Route path="/roadmap" element={<ProtectedRoute><Roadmap /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/project/:id" element={<ProtectedRoute><ProjectDetails /></ProtectedRoute>} />
            <Route path="/blocked-projects" element={<ProtectedRoute><BlockedProjects /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><TeamView /></ProtectedRoute>} />
            <Route path="/timeline" element={<ProtectedRoute><Timeline /></ProtectedRoute>} />
            <Route path="/investments" element={<ProtectedRoute><Investments /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
