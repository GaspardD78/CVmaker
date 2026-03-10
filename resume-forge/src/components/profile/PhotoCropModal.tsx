import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface PhotoCropModalProps {
  imageSrc: string;       // object URL of the original file
  onConfirm: (croppedBase64: string) => void;
  onCancel: () => void;
}

const CANVAS_SIZE = 300; // output canvas size (square)
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

export function PhotoCropModal({ imageSrc, onConfirm, onCancel }: PhotoCropModalProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Pan/zoom state
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastOffset = useRef({ x: 0, y: 0 });

  // Preview size (the visible drag area)
  const PREVIEW = 280;

  const clampOffset = useCallback(
    (ox: number, oy: number, img: HTMLImageElement, z: number) => {
      const scaledW = img.naturalWidth * z;
      const scaledH = img.naturalHeight * z;
      // Max shift so image covers the preview frame
      const maxX = Math.max(0, (scaledW - PREVIEW) / 2);
      const maxY = Math.max(0, (scaledH - PREVIEW) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, ox)),
        y: Math.max(-maxY, Math.min(maxY, oy)),
      };
    },
    []
  );

  // Initial zoom: fit the image to fill the preview square
  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;
    const handleLoad = () => {
      const minSide = Math.min(img.naturalWidth, img.naturalHeight);
      const initialZoom = Math.min(PREVIEW / minSide, MAX_ZOOM);
      setZoom(initialZoom);
      setOffset({ x: 0, y: 0 });
    };
    if (img.complete) handleLoad();
    else img.addEventListener('load', handleLoad);
    return () => img.removeEventListener('load', handleLoad);
  }, [imageSrc]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom(prev => {
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
        const img = imageRef.current;
        if (img) {
          setOffset(o => clampOffset(o.x, o.y, img, next));
        }
        return next;
      });
    },
    [clampOffset]
  );

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    lastOffset.current = offset;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const img = imageRef.current;
    if (img) {
      setOffset(clampOffset(lastOffset.current.x + dx, lastOffset.current.y + dy, img, zoom));
    }
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleZoomIn = () => {
    setZoom(prev => {
      const next = Math.min(MAX_ZOOM, prev + 0.15);
      const img = imageRef.current;
      if (img) setOffset(o => clampOffset(o.x, o.y, img, next));
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoom(prev => {
      const next = Math.max(MIN_ZOOM, prev - 0.15);
      const img = imageRef.current;
      if (img) setOffset(o => clampOffset(o.x, o.y, img, next));
      return next;
    });
  };

  const handleReset = () => {
    const img = imageRef.current;
    if (!img) return;
    const minSide = Math.min(img.naturalWidth, img.naturalHeight);
    const initialZoom = Math.min(PREVIEW / minSide, MAX_ZOOM);
    setZoom(initialZoom);
    setOffset({ x: 0, y: 0 });
  };

  const handleConfirm = () => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const ctx = canvas.getContext('2d')!;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    // The preview shows the image at zoom, centered at (PREVIEW/2 + offsetX, PREVIEW/2 + offsetY)
    // We need to find which part of the source image maps to the preview square
    const scaledW = img.naturalWidth * zoom;
    const scaledH = img.naturalHeight * zoom;
    const imgLeft = (PREVIEW - scaledW) / 2 + offset.x;  // left edge of scaled image in preview coords
    const imgTop  = (PREVIEW - scaledH) / 2 + offset.y;  // top edge

    // Preview frame starts at (0, 0) in preview coords
    // Source coords: (0 - imgLeft) / zoom, (0 - imgTop) / zoom
    const sx = (0 - imgLeft) / zoom;
    const sy = (0 - imgTop) / zoom;
    const sw = PREVIEW / zoom;  // how much of the source to use
    const sh = PREVIEW / zoom;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    onConfirm(base64);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-[380px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-900">Recadrer la photo</h2>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
            <X size={18} />
          </button>
        </div>

        {/* Preview area */}
        <div className="flex justify-center mb-3">
          <div
            ref={previewRef}
            className="relative overflow-hidden cursor-grab active:cursor-grabbing bg-gray-200"
            style={{ width: PREVIEW, height: PREVIEW, borderRadius: '50%', border: '3px solid #6366f1', userSelect: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <img
              ref={imageRef}
              src={imageSrc}
              alt="crop preview"
              draggable={false}
              style={{
                position: 'absolute',
                width: imageRef.current ? imageRef.current.naturalWidth * zoom : 'auto',
                height: imageRef.current ? imageRef.current.naturalHeight * zoom : 'auto',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                maxWidth: 'none',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <button onClick={handleZoomOut} className="p-2 hover:bg-gray-100 rounded-full text-gray-600" title="Dézoomer">
            <ZoomOut size={18} />
          </button>
          <input
            type="range"
            min={MIN_ZOOM * 100}
            max={MAX_ZOOM * 100}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={e => {
              const next = Number(e.target.value) / 100;
              setZoom(next);
              const img = imageRef.current;
              if (img) setOffset(o => clampOffset(o.x, o.y, img, next));
            }}
            className="w-32 accent-indigo-600"
          />
          <button onClick={handleZoomIn} className="p-2 hover:bg-gray-100 rounded-full text-gray-600" title="Zoomer">
            <ZoomIn size={18} />
          </button>
          <button onClick={handleReset} className="p-2 hover:bg-gray-100 rounded-full text-gray-500" title="Réinitialiser">
            <RotateCcw size={15} />
          </button>
        </div>

        <p className="text-xs text-center text-gray-400 mb-4">Faites glisser pour recadrer · molette ou curseur pour zoomer</p>

        {/* Hidden canvas for output */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
            Annuler
          </button>
          <button onClick={handleConfirm} className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
