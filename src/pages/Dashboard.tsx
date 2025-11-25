import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, 
  Plus, 
  Search,
  Calendar,
  Users,
  Settings,
  LogOut,
  MoreVertical
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProjectColumn } from "@/components/ProjectColumn";
import { Input } from "@/components/ui/input";

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const handleLogout = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold text-foreground">
                Pipeline de Gestão de Projetos
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon">
                <Calendar className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Users className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar projetos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Projeto
          </Button>
        </div>

        {/* Pipeline Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ProjectColumn
            title="A Fazer"
            status="todo"
            color="muted"
            projects={[
              {
                id: "1",
                title: "Redesign do Website",
                description: "Modernizar a interface e melhorar UX",
                priority: "high",
                dueDate: "2024-02-15",
                assignees: ["JD", "MS"],
              },
              {
                id: "2",
                title: "Integração API",
                description: "Conectar sistema com APIs externas",
                priority: "medium",
                dueDate: "2024-02-20",
                assignees: ["RP"],
              },
            ]}
          />

          <ProjectColumn
            title="Em Progresso"
            status="in-progress"
            color="info"
            projects={[
              {
                id: "3",
                title: "Desenvolvimento Mobile",
                description: "Criar app iOS e Android",
                priority: "high",
                dueDate: "2024-02-10",
                assignees: ["JD", "RP", "MS"],
              },
            ]}
          />

          <ProjectColumn
            title="Concluído"
            status="done"
            color="success"
            projects={[
              {
                id: "4",
                title: "Setup Inicial",
                description: "Configuração do ambiente de desenvolvimento",
                priority: "low",
                dueDate: "2024-01-30",
                assignees: ["MS"],
              },
            ]}
          />
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
