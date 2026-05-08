'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Wrench, CheckCircle2, AlertCircle, Clock, User, Calendar, ArrowUpRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface MessagePart {
  type: string;
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  [key: string]: unknown;
}

interface AgentMessageRendererProps {
  parts: MessagePart[];
  role: 'user' | 'assistant' | 'system';
  onOpenProject?: (projectId: string) => void;
}

type DataCardItem = {
  id?: unknown;
  title?: unknown;
  name?: unknown;
  status?: unknown;
  priority?: unknown;
  description?: unknown;
  due_date?: unknown;
  assigned_to?: unknown;
};

/** Remove as opções em colchetes do texto para renderização */
function cleanText(text: string): string {
  // Remove linhas que contêm APENAS opções em colchetes
  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      // Remove linhas que são só opções como "[Opção 1] | [Opção 2]"
      return !trimmed.match(/^(\[[^\]]+\]\s*\|\s*)*\[[^\]]+\]$/);
    })
    .join('\n')
    .trim();
}

/** Renderiza um item de dado estruturado (projeto, atividade, etc) */
function renderDataItem(item: Record<string, unknown>, itemType?: string, onOpenProject?: (projectId: string) => void) {
  if (!item || typeof item !== 'object') return null;

  const { id, title, name, status, priority, description, due_date, assigned_to } = item as DataCardItem;
  const canOpenProject = itemType === 'project' && typeof id === 'string' && !!onOpenProject;

  return (
    <div className="p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-sm truncate">{title || name || 'Item'}</h4>
          {id && <p className="text-xs text-muted-foreground font-mono">{String(id).slice(0, 12)}…</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          {status && <Badge variant="outline" className="text-xs">{status}</Badge>}
          {priority && <Badge className={getPriorityColor(priority)} variant="secondary">{priority}</Badge>}
        </div>
      </div>
      {description && <p className="text-xs text-foreground/70 mb-2 line-clamp-2">{description}</p>}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {assigned_to && <span className="flex items-center gap-1"><User className="w-3 h-3" />{assigned_to}</span>}
        {due_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{due_date}</span>}
      </div>
      {canOpenProject && (
        <div className="mt-3">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onOpenProject(id)}>
            <ArrowUpRight className="h-3.5 w-3.5" />
            Abrir projeto
          </Button>
        </div>
      )}
    </div>
  );
}

function isRenderableDataItem(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return 'id' in value || 'title' in value || 'name' in value;
}

function getPriorityColor(priority: string) {
  const p = String(priority).toLowerCase();
  if (p.includes('alta') || p.includes('high')) return 'bg-red-500/20 text-red-700';
  if (p.includes('urgente')) return 'bg-orange-500/20 text-orange-700';
  if (p.includes('média') || p.includes('medium')) return 'bg-yellow-500/20 text-yellow-700';
  if (p.includes('baixa') || p.includes('low')) return 'bg-green-500/20 text-green-700';
  return 'bg-gray-500/20 text-gray-700';
}

/** Tenta parsear e renderizar dados estruturados da resposta */
function parseStructuredData(text: string, onOpenProject?: (projectId: string) => void) {
  // Procura por padrões JSON entre as linhas
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```|(\[|\{)[\s\S]*?(\]|\})/);
  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data)) {
        return data.map((item, i) => (
          <div key={i} className="w-full">
            {renderDataItem(item, undefined, onOpenProject)}
          </div>
        ));
      }
      return renderDataItem(data, undefined, onOpenProject);
    } catch {
      return null;
    }
  }
  return null;
}

function formatOutputLabel(key: string): string {
  const labels: Record<string, string> = {
    created_tasks: 'Tarefa principal do chamado',
    created_subtasks_count: 'Subtarefas derivadas dos subchamados',
    created_tasks_count: 'Quantidade de tarefas principais',
    total_estimated_hours: 'Estimativa total (horas)',
    user_story: 'História do usuário',
    gut: 'Prioridade GUT',
  };
  return labels[key] ?? key;
}

function renderSpecialGlpiSection(key: string, value: unknown, onOpenProject?: (projectId: string) => void) {
  if (key === 'created_tasks' && Array.isArray(value)) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">Tarefa principal do chamado:</p>
        <div className="space-y-2 pl-2 border-l-2 border-primary">
          {value.map((item, idx) => (
            <div key={idx}>{renderDataItem(item as Record<string, unknown>, key, onOpenProject)}</div>
          ))}
        </div>
      </div>
    );
  }

  if (key === 'created_subtasks_count' && typeof value === 'number') {
    return (
      <div className="text-xs text-foreground/80">
        <span className="font-semibold">Subtarefas derivadas dos subchamados:</span>{' '}
        <Badge variant="secondary" className="text-xs">{value}</Badge>
      </div>
    );
  }

  return null;
}

export function AgentMessageRenderer({ parts, role, onOpenProject }: AgentMessageRendererProps) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          const text = part.text || '';
          const cleanedText = cleanText(text);
          const structuredData = parseStructuredData(text, onOpenProject);

          if (role === 'assistant') {
            return (
              <div key={i} className="space-y-3 w-full">
                {structuredData && (
                  <div className="space-y-2 w-full">
                    {structuredData}
                  </div>
                )}
                <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed
                  prose-p:my-1.5 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                  prose-headings:mt-3 prose-headings:mb-1.5 prose-h1:text-base prose-h2:text-sm
                  prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                  prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded
                  prose-strong:font-semibold prose-em:italic
                  prose-a:text-primary prose-a:underline prose-a:no-underline prose-a:hover:underline
                  prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic
                ">
                  <ReactMarkdown>{cleanedText}</ReactMarkdown>
                </div>
              </div>
            );
          }

          return (
            <p key={i} className="whitespace-pre-wrap leading-relaxed text-sm">
              {text}
            </p>
          );
        }

        if (part.type.startsWith('tool-')) {
          const toolName = part.type.replace('tool-', '');
          const state = part.state || 'call';
          const hasOutput = !!part.output;
          const hasError = !!part.errorText;

          const statusColor = hasError
            ? 'text-destructive'
            : hasOutput
            ? 'text-green-600'
            : 'text-amber-600';

          const statusIcon = hasError
            ? <AlertCircle className="w-4 h-4" />
            : hasOutput
            ? <CheckCircle2 className="w-4 h-4" />
            : <Clock className="w-4 h-4 animate-pulse" />;

          return (
            <div key={i} className="w-full">
              <Card className="border-dashed bg-muted/40 hover:bg-muted/60 transition-colors">
                <div className="p-3 space-y-2">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-xs font-mono font-semibold text-foreground truncate">{toolName}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${statusColor}`}>
                      {statusIcon}
                      <span className="text-xs font-medium capitalize">{state}</span>
                    </div>
                  </div>

                  {/* Input */}
                  {part.input && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-semibold">Entrada:</p>
                      <pre className="text-xs bg-background/50 rounded p-2 overflow-x-auto max-h-[120px] overflow-y-auto border border-border/50 leading-tight">
                        {JSON.stringify(part.input, null, 2).slice(0, 500)}
                      </pre>
                    </div>
                  )}

                  {/* Output — renderiza estruturado se possível */}
                  {part.output && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-semibold">Resultado:</p>
                      {typeof part.output === 'object' && !Array.isArray(part.output) && (
                        <>
                      {Object.entries(part.output as Record<string, unknown>).map(([key, value]) => {
                            if (key === 'formatted_response' || key === 'error') return null;

                            if (toolName === 'createGlpiWorkPackage') {
                              const special = renderSpecialGlpiSection(key, value, onOpenProject);
                              if (special) return <div key={key}>{special}</div>;
                            }

                            if (Array.isArray(value)) {
                              return (
                                <div key={key} className="space-y-1">
                                  <p className="text-xs font-medium text-foreground">{formatOutputLabel(key)}:</p>
                                  <div className="space-y-2 pl-2 border-l-2 border-primary">
                                    {(value as Array<any>).map((item, idx) => (
                                      <div key={idx}>{renderDataItem(item, key, onOpenProject)}</div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }

                            if (isRenderableDataItem(value)) {
                              return (
                                <div key={key} className="space-y-1">
                                  <p className="text-xs font-medium text-foreground">{formatOutputLabel(key)}:</p>
                                  {renderDataItem(value, key, onOpenProject)}
                                </div>
                              );
                            }

                            if (key === 'gut' && typeof value === 'object' && value !== null) {
                              const gut = value as Record<string, unknown>;
                              return (
                                <div key={key} className="text-xs text-foreground/80 space-x-2">
                                  <span className="font-semibold">Prioridade GUT:</span>
                                  <Badge variant="outline" className="text-xs">G {String(gut.gravity ?? '-')}</Badge>
                                  <Badge variant="outline" className="text-xs">U {String(gut.urgency ?? '-')}</Badge>
                                  <Badge variant="outline" className="text-xs">T {String(gut.tendency ?? '-')}</Badge>
                                  {'score' in gut && <Badge className="text-xs">Score {String(gut.score)}</Badge>}
                                </div>
                              );
                            }

                            return (
                              <div key={key} className="text-xs text-foreground/70">
                                <span className="font-medium">{formatOutputLabel(key)}:</span> {String(value)}
                              </div>
                            );
                          })}
                        </>
                      )}
                      {typeof part.output === 'string' && (
                        <pre className="text-xs bg-background/50 rounded p-2 overflow-x-auto leading-tight text-foreground/70">
                          {String(part.output).slice(0, 300)}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {part.errorText && (
                    <div className="space-y-1 bg-destructive/10 rounded p-2 border border-destructive/30">
                      <p className="text-xs text-destructive font-semibold">Erro:</p>
                      <p className="text-xs text-destructive/80">{String(part.errorText).slice(0, 200)}</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          );
        }

        return null;
      })}
    </>
  );
}
