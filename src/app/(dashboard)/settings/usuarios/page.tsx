'use client';

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { UserManagement } from "@/components/UserManagement";
import { ChevronLeft, Users } from "lucide-react";

const SettingsUsersPage = () => {
  return (
    <div className="px-4 py-6 space-y-4 max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
            <ChevronLeft className="w-4 h-4" /> Voltar para Configuracoes
          </Link>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Configuracoes de Usuarios
          </CardTitle>
          <CardDescription>
            Cadastro, edicao, ativacao e controle de abas por usuario.
          </CardDescription>
        </CardHeader>
      </Card>

      <UserManagement />
    </div>
  );
};

export default SettingsUsersPage;
