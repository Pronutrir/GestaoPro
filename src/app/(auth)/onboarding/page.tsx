'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function OnboardingPage() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState<Array<{
    id: string;
    project_id: string;
    project_title: string;
    invited_at: string;
    invited_by_name: string;
  }>>([]);
  
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Busca convites pendentes do usuário
      const { data: invites, error } = await supabase
        .from('project_members')
        .select(`
          id,
          project_id,
          invitation_status,
          invited_at,
          invited_by,
          projects (
            id,
            title
          )
        `)
        .eq('user_id', user.id)
        .eq('invitation_status', 'pending');

      if (error) throw error;

      // Busca nomes dos convidantes (FK não existe, então consulta separada)
      const invitedByIds = (invites || [])
        .map((inv: any) => inv.invited_by)
        .filter((id: string | null): id is string => id !== null);

      let inviterNames: Record<string, string> = {};
      if (invitedByIds.length > 0) {
        const { data: inviters } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', invitedByIds);
        
        inviters?.forEach((p: any) => {
          inviterNames[p.id] = p.full_name;
        });
      }

      const formatted = (invites || []).map((inv: any) => ({
        id: inv.id,
        project_id: inv.project_id,
        project_title: inv.projects?.title || 'Projeto desconhecido',
        invited_at: inv.invited_at,
        invited_by_name: inv.invited_by ? inviterNames[inv.invited_by] || 'Sistema' : 'Sistema',
      }));

      setInvitations(formatted);
      setLoading(false);

      // Se não há convites, redireciona para dashboard
      if (formatted.length === 0) {
        router.push('/');
      }
    } catch (error) {
      console.error('Erro ao carregar convites:', error);
      toast.error('Erro ao carregar convites');
      setLoading(false);
    }
  };

  const handleAccept = async (inviteId: string) => {
    setProcessingInviteId(inviteId);
    try {
      const { error } = await supabase
        .from('project_members')
        .update({
          invitation_status: 'accepted',
          responded_at: new Date().toISOString(),
        })
        .eq('id', inviteId);

      if (error) throw error;

      toast.success('Convite aceito! Bem-vindo ao projeto.');
      
      // Limpa o cookie e redireciona para o dashboard
      document.cookie = 'invitation_status=accepted; path=/; max-age=300';
      
      await new Promise(resolve => setTimeout(resolve, 500));
      router.push('/');
    } catch (error) {
      console.error('Erro ao aceitar convite:', error);
      toast.error('Erro ao aceitar convite');
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    setProcessingInviteId(inviteId);
    try {
      const { error } = await supabase
        .from('project_members')
        .update({
          invitation_status: 'declined',
          responded_at: new Date().toISOString(),
          decline_reason: 'Recusado durante onboarding',
        })
        .eq('id', inviteId);

      if (error) throw error;

      toast.info('Convite recusado.');
      await loadInvitations();
    } catch (error) {
      console.error('Erro ao recusar convite:', error);
      toast.error('Erro ao recusar convite');
    } finally {
      setProcessingInviteId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Carregando convites...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Bem-vindo!</CardTitle>
          <CardDescription>
            Você foi convidado para participar de um ou mais projetos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Nenhum convite pendente</p>
            </div>
          ) : (
            invitations.map((invite) => (
              <div
                key={invite.id}
                className="border rounded-lg p-4 space-y-3"
              >
                <div>
                  <h3 className="font-semibold text-sm">{invite.project_title}</h3>
                  <p className="text-xs text-muted-foreground">
                    Convidado por: {invite.invited_by_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(invite.invited_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleAccept(invite.id)}
                    disabled={processingInviteId === invite.id}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Aceitar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleDecline(invite.id)}
                    disabled={processingInviteId === invite.id}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Recusar
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
