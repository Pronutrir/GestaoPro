import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, MoreVertical } from "lucide-react";

interface Project {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueDate: string;
  assignees: string[];
}

interface ProjectColumnProps {
  title: string;
  status: string;
  color: string;
  projects: Project[];
}

const priorityColors = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning text-warning-foreground",
  high: "bg-destructive text-destructive-foreground",
};

export const ProjectColumn = ({ title, status, color, projects }: ProjectColumnProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <Badge variant="secondary" className="rounded-full">
            {projects.length}
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        {projects.map((project) => (
          <Card key={project.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-foreground mb-1">
                    {project.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {project.description}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge 
                    className={`${priorityColors[project.priority]} text-xs`}
                  >
                    {project.priority === "high" && "Alta"}
                    {project.priority === "medium" && "Média"}
                    {project.priority === "low" && "Baixa"}
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {new Date(project.dueDate).toLocaleDateString("pt-BR")}
                  </div>
                </div>

                <div className="flex -space-x-2">
                  {project.assignees.map((assignee, index) => (
                    <Avatar key={index} className="w-6 h-6 border-2 border-background">
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                        {assignee}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
