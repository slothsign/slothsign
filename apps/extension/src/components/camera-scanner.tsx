import { useEffect, useRef } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";

export function CameraScanner({
  scanning,
  onToggle,
  onScan,
  onError,
}: {
  scanning: boolean;
  onToggle: () => void;
  onScan: (data: string) => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let raf = 0;
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
        const tick = () => {
          const video = videoRef.current;
          if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
            raf = requestAnimationFrame(tick);
            return;
          }
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            const code = jsQR(
              ctx.getImageData(0, 0, canvas.width, canvas.height).data,
              canvas.width,
              canvas.height,
            );
            if (code?.data) {
              onScan(code.data);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => onError("Camera unavailable"));
    return () => {
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);

  return (
    <div className="space-y-3">
      <video ref={videoRef} className="w-full rounded-md border border-border" />
      <Button variant="outline" size="sm" className="w-full" onClick={onToggle}>
        {scanning ? "Stop scanning" : "Start scanning"}
      </Button>
    </div>
  );
}
