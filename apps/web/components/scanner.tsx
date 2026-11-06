"use client";
import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
export function Scanner({ onRead }: { onRead: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null),
    callback = useRef(onRead),
    [error, setError] = useState("");
  callback.current = onRead;
  useEffect(() => {
    let controls: IScannerControls | undefined,
      stopped = false;
    const reader = new BrowserMultiFormatReader();
    void reader
      .decodeFromVideoDevice(undefined, video.current!, (result) => {
        if (result && !stopped) {
          stopped = true;
          controls?.stop();
          callback.current(result.getText());
        }
      })
      .then((c) => {
        controls = c;
        if (stopped) c.stop();
      })
      .catch(() =>
        setError(
          "Não foi possível abrir a câmera. Permita o acesso ou digite o código manualmente.",
        ),
      );
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);
  return (
    <div className="scanner">
      <video ref={video} muted playsInline />
      <p>
        {error || "Aponte para o QR Code ou código de barras da nota fiscal."}
      </p>
    </div>
  );
}
