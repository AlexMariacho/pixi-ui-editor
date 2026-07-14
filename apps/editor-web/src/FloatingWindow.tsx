import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export type FloatingWindowPosition = { x: number; y: number };
export type FloatingWindowSize = { width: number; height: number };

type ResizeHandle = "top" | "right" | "bottom" | "left" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

const resizeHandles: ResizeHandle[] = ["top", "right", "bottom", "left", "top-left", "top-right", "bottom-left", "bottom-right"];

type FloatingWindowProps = {
  ariaLabel: string;
  className?: string;
  children: ReactNode;
  minSize: FloatingWindowSize;
  onClose: () => void;
  onPositionChange: (position: FloatingWindowPosition) => void;
  onSizeChange: (size: FloatingWindowSize) => void;
  position: FloatingWindowPosition;
  size: FloatingWindowSize;
  title: string;
  titleActions?: ReactNode;
};

export function FloatingWindow({
  ariaLabel,
  className = "",
  children,
  minSize,
  onClose,
  onPositionChange,
  onSizeChange,
  position,
  size,
  title,
  titleActions,
}: FloatingWindowProps) {
  const windowRef = useRef<HTMLElement>(null);

  const addPointerListeners = (move: (event: globalThis.PointerEvent) => void) => {
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button") !== null) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = windowRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    addPointerListeners((moveEvent) => onPositionChange({
      x: position.x + moveEvent.clientX - offset.x - rect.left,
      y: position.y + moveEvent.clientY - offset.y - rect.top,
    }));
  };

  const startResize = (handle: ResizeHandle) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const fromLeft = handle.includes("left");
    const fromRight = handle.includes("right");
    const fromTop = handle.includes("top");
    const fromBottom = handle.includes("bottom");

    addPointerListeners((moveEvent) => {
      const deltaX = moveEvent.clientX - start.x;
      const deltaY = moveEvent.clientY - start.y;
      const width = Math.max(minSize.width, size.width + (fromLeft ? -deltaX : fromRight ? deltaX : 0));
      const height = Math.max(minSize.height, size.height + (fromTop ? -deltaY : fromBottom ? deltaY : 0));
      onSizeChange({ width, height });
      onPositionChange({
        x: fromLeft ? position.x + size.width - width : position.x,
        y: fromTop ? position.y + size.height - height : position.y,
      });
    });
  };

  const startResizeFromEdge = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button") !== null) return;
    const rect = windowRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const horizontal = event.clientX - rect.left <= 6 ? "left" : rect.right - event.clientX <= 6 ? "right" : "";
    const vertical = event.clientY - rect.top <= 6 ? "top" : rect.bottom - event.clientY <= 6 ? "bottom" : "";
    if (horizontal === "" && vertical === "") return;
    const handle = `${vertical}${vertical !== "" && horizontal !== "" ? "-" : ""}${horizontal}` as ResizeHandle;
    startResize(handle)(event as ReactPointerEvent<HTMLDivElement>);
  };

  return (
    <section ref={windowRef} className={`floating-window ${className}`.trim()} aria-label={ariaLabel} style={{ left: position.x, top: position.y, width: size.width, height: size.height }} onPointerDown={startResizeFromEdge}>
      <div className="floating-window-titlebar" onPointerDown={startDrag}>
        <h2>{title}</h2>
        {titleActions}
        <button type="button" aria-label={`Close ${title}`} onClick={onClose}>×</button>
      </div>
      <div className="floating-window-content">{children}</div>
      {resizeHandles.map((handle) => <div key={handle} className={`floating-window-resize-handle floating-window-resize-${handle}`} onPointerDown={startResize(handle)} aria-hidden="true" />)}
    </section>
  );
}
