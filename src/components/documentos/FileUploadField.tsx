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

  if (value) {
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
    const sugerido = valida ? nomeSugeridoDaUrl(url) : "";
    return (
      <div>
        <Seletor />
        <div className="space-y-2">
          <Input
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className={cn("font-mono text-[13px]", url && !valida && "border-destructive")}
          />
          {url && !valida && (
            <p className="text-[11px] text-destructive">
              Endereço inválido. Precisa começar com <span className="font-mono">http://</span> ou{" "}
              <span className="font-mono">https://</span>.
            </p>
          )}
          {/* SEM CAMPO DE NOME AQUI. O formulário já tem "Nome do documento"
              logo abaixo, e eu havia acrescentado um segundo — dois campos
              pedindo a mesma coisa, com o de baixo sendo o que de fato grava.
              O nome sugerido da URL vai direto para aquele, do mesmo jeito que
              o upload de arquivo já preenche com o nome do arquivo. */}
          <Button
            type="button" variant="secondary" className="w-full"
            disabled={!valida}
            onClick={() => onChange({
              fileName: sugerido || "Documento",
              fileUrl: url,
              storagePath: null,
              fileType: "link",
              fileSize: null,
            })}
          >
            Usar link
          </Button>
          <p className="text-[11px] text-muted-foreground">
            O arquivo fica <strong>fora do sistema</strong>: pode receber ciência e
            aprovação, mas <strong>não assinatura</strong> — o que está no endereço
            pode ser trocado depois de assinado.
          </p>
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
