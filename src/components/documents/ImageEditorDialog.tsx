'use client';

import { useCallback, useEffect, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Loader2, Crop as CropIcon } from "lucide-react";

interface Props {
  file: File | null;
  imageSrc?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (blob: Blob, widthPercent: number) => Promise<void> | void;
  initialWidthPercent?: number;
}

async function getCroppedBlob(src: string, area: Area, mime = "image/png"): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), mime, 0.92));
}

export function ImageEditorDialog({ file, imageSrc = null, open, onOpenChange, onConfirm, initialWidthPercent = 100 }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [widthPct, setWidthPct] = useState(100);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file && !imageSrc) { setSrc(null); return; }
    const url = file ? URL.createObjectURL(file) : imageSrc;
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setWidthPct(initialWidthPercent);
    return () => {
      if (file && url) URL.revokeObjectURL(url);
    };
  }, [file, imageSrc, initialWidthPercent]);

  const onCropComplete = useCallback((_: Area, areaPx: Area) => {
    setCroppedArea(areaPx);
  }, []);

  const handleConfirm = async () => {
    if (!src || !croppedArea) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(src, croppedArea);
      await onConfirm(blob, widthPct);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const ratios: { label: string; v: number | undefined }[] = [
    { label: "Livre", v: undefined },
    { label: "1:1", v: 1 },
    { label: "4:3", v: 4 / 3 },
    { label: "16:9", v: 16 / 9 },
    { label: "3:4", v: 3 / 4 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[750px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CropIcon className="w-4 h-4" /> Ajustar imagem</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative w-full h-[360px] bg-muted rounded-md overflow-hidden">
            {src && (
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {ratios.map((r) => (
              <Button key={r.label} type="button" size="sm"
                variant={aspect === r.v ? "default" : "outline"}
                onClick={() => setAspect(r.v)}>{r.label}</Button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Zoom: {zoom.toFixed(2)}x</Label>
              <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rotação: {rotation}°</Label>
              <Slider value={[rotation]} min={0} max={360} step={1} onValueChange={(v) => setRotation(v[0])} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Largura no documento: {widthPct}%</Label>
              <Slider value={[widthPct]} min={20} max={100} step={5} onValueChange={(v) => setWidthPct(v[0])} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={busy || !croppedArea}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Inserir imagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
