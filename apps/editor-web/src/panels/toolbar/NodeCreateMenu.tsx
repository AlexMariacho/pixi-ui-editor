import { useEffect, useRef, useState } from "react";
import type { AddableNodeType } from "../../store/index.js";

export type NodeCreateItem = { type: AddableNodeType; label: string; disabled?: boolean };
export type NodeCreateSection = { label?: string; items: readonly NodeCreateItem[] };

export function NodeCreateMenu({
  label,
  disabled,
  sections,
  onCreate,
}: {
  label: string;
  disabled: boolean;
  sections: readonly NodeCreateSection[];
  onCreate: (type: AddableNodeType) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="node-create-menu">
      <button
        type="button"
        className={`node-create-trigger${isOpen ? " node-create-trigger-open" : ""}`}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((current) => !current)}
      >
        + {label} <span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <section className="node-create-popover" aria-label={`Add ${label}`} role="menu">
          {sections.map((section, index) => (
            <div key={section.label ?? index} className="node-create-section">
              {section.label !== undefined && <div className="node-create-section-label">{section.label}</div>}
              {section.items.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  role="menuitem"
                  className="node-create-item"
                  disabled={item.disabled}
                  onClick={() => {
                    onCreate(item.type);
                    setIsOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
