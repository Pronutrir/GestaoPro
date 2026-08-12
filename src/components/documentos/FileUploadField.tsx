'use client';
// UPLOAD DE VERDADE — o campo que faltava.
//
// A aba Documentos pedia "URL do documento" num input de texto: para anexar um
// contrato, a pessoa precisava primeiro hospedá-lo em outro lugar. Enquanto
// isso, o card do Kanban já subia arquivo normalmente. Mesma tabela, dois modos
// de entrada incompatíveis.
//
// O LINK VOLTOU A SER ESCOLHA. Ele existia só como fallback automático quando
// o bucket não estava criado no ambiente — nunca por vontade de quem cadastra.
// Para registrar uma norma da Anvisa ou uma planilha compartilhada era preciso
// baixar e subir de novo, criando uma cópia que envelhece sozinha enquanto a
// original continua mudando.
//
// Documento externo é caso real (norma, legislação, planilha viva). Só não pode
// ser ASSINADO: o fluxo formal calcula o hash do conteúdo para provar que o que
// foi assinado é o que está lá, e um endereço pode apontar para outra coisa
// amanhã. A tela diz isso onde a escolha é feita.
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, FileText, Loader2, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  MAX_UPLOAD_BYTES, formatSize, safeFileName, fileExtension,
  urlValida, nomeSugeridoDaUrl,
} from "@/lib/documentCenter";
import { cn } from "@/lib/utils";

export interface UploadResult {
  fileName: string;
  fileUrl: string;
  storagePath: string | null;
  fileType: string;
  fileSize: number | null;
}

interface Props {
  projectId: string;
  value: UploadResult | null;
  onChange: (v: UploadResult | null) => void;
}

export function FileUploadField({ projectId, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const { toast } = useToast();

  const upload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: "Arquivo grande demais",
        description: `Limite de ${formatSize(MAX_UPLOAD_BYTES)}. Para arquivos maiores, use o link.`,
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    // A primeira pasta é o id do projeto — é isso que a política do bucket lê
    // para decidir quem pode baixar.
    const path = `${projectId}/${Date.now()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from("project-files").upload(path, file);
    setUploading(false);

    if (error) {
      const missingBucket = /bucket|not found/i.test(error.message);
      toast({
        title: missingBucket ? "Upload ainda não habilitado" : "Falha no upload",
        description: missingBucket
          ? "Rode scripts/apply-leva-tap.sh na VM. Enquanto isso, use o link."
          : error.message,
        variant: "destructive",
      });
      if (missingBucket) setLinkMode(true);
      return;
    }

    onChange({
      fileName: file.name,
      // Bucket privado: a URL de leitura é assinada na hora de abrir. Guardar
      // uma URL fixa aqui não funcionaria — ela expira.
      fileUrl: path,
      storagePath: path,
      // Extensão em vez do MIME: "PDF" comunica, "application/pdf" não.
      fileType: (fileExtension(file.name) || "arquivo").toUpperCase(),
      fileSize: file.size,
    });
  };

  // No modo link o campo NÃO dá lugar ao resumo: o valor é confirmado a cada
  // tecla, e trocar a tela no meio da digitação tiraria o campo debaixo do
  // cursor. Para arquivo o resumo continua — ali o valor vem de uma escolha
  // única, não de algo que se continua editando.
  if (value && !linkMode) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <FileText className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[13px] truncate flex-1" title={value.fileName}>{value.fileName}</span>
        {value.fileSize ? (
          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
            {formatSize(value.fileSize)}
          </span>
        ) : null}
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0"
          onClick={() => onChange(null)} title="Remover">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  /* SELETOR ARQUIVO / LINK.
     O modo link já existia, mas só como FALLBACK automático quando o bucket
     não estava criado — nunca por escolha. Resultado: para registrar uma norma
     da Anvisa ou uma planilha compartilhada era preciso baixar e subir de
     novo, criando uma cópia que envelhece sozinha enquanto a original muda.
     O banco sempre aceitou link (`file_url` é texto e `storage_path` nulo já
     identifica externo, que é como a edição distingue os dois hoje). Faltava
     a porta de entrada. */
  const Seletor = () => (
    <div className="inline-flex rounded-md border border-input overflow-hidden h-8 mb-2">
      {([
        { modo: false, icone: <Upload className="w-3.5 h-3.5" />, label: "Arquivo" },
        { modo: true, icone: <LinkIcon className="w-3.5 h-3.5" />, label: "Link" },
      ]).map((op, i) => (
        <button
          key={op.label}
          type="button"
          onClick={() => setLinkMode(op.modo)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 text-[12.5px] transition-colors",
            i > 0 && "border-l border-input",
            linkMode === op.modo
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:bg-muted/60",
          )}
        >
          {op.icone} {op.label}
        </button>
      ))}
    </div>
  );

  if (linkMode) {
    const url = linkUrl.trim();
    const valida = urlValida(url);
    return (
      <div>
        <Seletor />
        <div className="space-y-2">
          {/* Confirma sozinho assim que o endereço fica válido. Digitar já é a
              intenção: exigir um segundo clique para dizer "sim, era isso" é o
              tipo de etapa que existe para o programa, não para quem usa. */}
          <Input
            placeholder="https://…"
            value={linkUrl}
            autoFocus
            onChange={(e) => {
              const v = e.target.value;
              setLinkUrl(v);
              const limpo = v.trim();
              if (urlValida(limpo)) {
                onChange({
                  fileName: nomeSugeridoDaUrl(limpo) || "Documento",
                  fileUrl: limpo,
                  storagePath: null,
                  fileType: "link",
                  fileSize: null,
                });
              } else if (value) {
                // Apagar ou estragar o endereço desfaz a confirmação: senão o
                // formulário guardaria um link que não está mais no campo.
                onChange(null);
              }
            }}
            className={cn("font-mono text-[13px]", url && !valida && "border-destructive")}
          />
          {/* SEM BOTÃO "USAR LINK" e sem campo de nome.
              Colar o endereço JÁ É a ação — o modo arquivo não pede confirmação
              depois de escolher o arquivo, e o link não tinha por que pedir. O
              campo de nome era duplicata do que existe logo abaixo; o nome
              sugerido vai direto para lá, como o upload já fazia.
              O aviso sobre assinatura saiu daqui: explicava uma regra de um
              fluxo que ainda não começou, antes de a pessoa ter feito nada.
              Ele aparece quando importa — ao tentar circular para assinatura
              (DocumentManager:177), com a instrução do que fazer. */}
          {url && !valida ? (
            <p className="text-[11px] text-destructive">
              Precisa começar com <span className="font-mono">http://</span> ou{" "}
              <span className="font-mono">https://</span>.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              O documento fica fora do sistema — o endereço aponta para onde ele
              está hoje.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
    <Seletor />
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void upload(f);
      }}
      className={cn(
        "rounded-md border border-dashed px-4 py-6 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-input bg-muted/20",
      )}
    >
      <input ref={inputRef} type="file" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />

      {uploading ? (
        <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> enviando…
        </span>
      ) : (
        <>
          <Upload className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-[13px] text-foreground mb-1">
            Arraste o arquivo aqui ou{" "}
            <button type="button" className="text-primary font-medium hover:underline"
              onClick={() => inputRef.current?.click()}>
              escolha do computador
            </button>
          </p>
          <p className="text-[11px] text-muted-foreground">
            O arquivo fica no projeto, com acesso controlado — e pode ser assinado.
          </p>
        </>
      )}
    </div>
    </div>
  );
}
