import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

const FRAME_MS = 250;
const RENDER = { width: 220, margin: 2, errorCorrectionLevel: "M" as const };

export function QrCodePanel({ parts }: { parts?: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string>();
  const generationRef = useRef(0);

  useEffect(() => {
    setError(undefined);
    setIndex(0);
    if (!parts || parts.length === 0) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % parts.length);
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [parts]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parts || parts.length === 0) return;
    const generation = ++generationRef.current;
    const frame = parts[index]!;
    const buffer = document.createElement("canvas");
    QRCode.toCanvas(buffer, frame, RENDER)
      .then(() => {
        if (generation !== generationRef.current) return;
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = buffer.width;
        canvas.height = buffer.height;
        ctx?.drawImage(buffer, 0, 0);
      })
      .catch((e) => {
        if (generation !== generationRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [parts, index]);

  if (!parts || parts.length === 0) {
    return (
      <p className="text-center text-xs text-destructive">{error ?? "No QR data available"}</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        {error ? (
          <p className="text-center text-xs text-destructive">{error}</p>
        ) : (
          <canvas ref={canvasRef} className="rounded-md border border-border bg-white p-2" />
        )}
      </div>
      {parts.length > 1 ? (
        <p className="text-center text-xs text-muted-foreground">
          Frame {index + 1} of {parts.length}
        </p>
      ) : null}
    </div>
  );
}
