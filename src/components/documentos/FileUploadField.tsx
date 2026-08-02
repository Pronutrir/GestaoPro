'use client';
// UPLOAD DE VERDADE — o campo que faltava.
//
// A aba Documentos pedia "URL do documento" num input de texto: para anexar um
// contrato, a pessoa precisava primeiro hospedá-lo em outro lugar. Enquanto
// isso, o card do Kanban já subia arquivo normalmente. Mesma tabela, dois modos
// de entrada incompatíveis.
//
// O arraste continua aceitando link colado, porque documento externo (norma,
// legislação, planilha compartilhada) é caso real — só deixa de ser o único
// caminho possível.
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MAX_UPLOAD_BYTES, formatSize, safeFileName, fileExtension } from "@/lib/documentCenter";
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
  const [linkName, setLinkName] = useState("");
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
          ? "Rode scripts/apply-project-files.sh na VM. Enquanto isso, use o link."
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

  if (linkMode) {
    return (
      <div className="space-y-2">
        <Input placeholder="Nome do documento" value={linkName}
          onChange={(e) => setLinkName(e.target.value)} />
        <div className="flex gap-2">
          <Input placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <Button type="button" variant="secondary" className="shrink-0"
            disabled={!linkUrl.trim()}
            onClick={() => {
              const name = linkName.trim() || linkUrl.split("/").pop() || "Documento";
              onChange({
                fileName: name, fileUrl: linkUrl.trim(), storagePath: null,
                fileType: "link", fileSize: null,
              });
            }}>
            Usar link
          </Button>
        </div>
        {/* Só se chega aqui por FALLBACK (bucket ausente), nunca por escolha.
            Voltar levaria a um upload que falha de novo — em vez do botão,
            explica o que está acontecendo e o que o link não permite. */}
        <p className="text-[11px] text-muted-foreground">
          O envio de arquivo ainda não está habilitado neste ambiente. Documento
          por link pode receber ciência e aprovação, mas <strong>não assinatura</strong>:
          um arquivo fora do sistema pode ser trocado depois de assinado.
        </p>
      </div>
    );
  }

  return (
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
          {/* Sem atalho para "usar um link externo": ele desfazia a melhoria
              num clique e levava a um documento que NÃO pode ser assinado
              (link pode ser trocado pelo dono, e o hash falha em silêncio).
              O modo link continua existindo como FALLBACK automático, quando o
              bucket ainda não foi criado no ambiente — ali não é escolha, é a
              única forma de cadastrar. */}
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
  );
}
