import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const sections = [
    {
      title: 'Tools & Creation',
      shortcuts: [
        { key: 'V / 1', desc: 'Select / Pointer tool' },
        { key: 'H / 2', desc: 'Hand / Pan canvas tool' },
        { key: 'Space + Drag', desc: 'Temporary pan while in any tool' },
        { key: 'R', desc: 'Rectangle shape' },
        { key: 'O', desc: 'Ellipse / Circle shape' },
        { key: 'D', desc: 'Diamond / Decision shape' },
        { key: 'A', desc: 'Magnetic Arrow connector' },
        { key: 'T', desc: 'Text label node' },
        { key: 'S', desc: 'Sticky note' },
        { key: 'P', desc: 'Freehand pencil tool' },
        { key: 'E', desc: 'Eraser tool' },
      ],
    },
    {
      title: 'Navigation & Viewport',
      shortcuts: [
        { key: 'Scroll', desc: 'Pan canvas vertically (Up / Down)' },
        { key: 'Ctrl + Scroll', desc: 'Zoom in / out centered at mouse cursor (10% to 800%)' },
        { key: 'Shift + Scroll', desc: 'Pan canvas horizontally (Down: right, Up: left)' },
        { key: 'Middle Click + Drag', desc: 'Pan canvas freely' },
        { key: 'Double-Click Element', desc: 'Edit element text / label in-place' },
      ],
    },
    {
      title: 'Editing, History & Arrangement',
      shortcuts: [
        { key: 'Ctrl + A', desc: 'Select all elements in the board' },
        { key: 'Ctrl + Z', desc: 'Undo last action (50-level stack)' },
        { key: 'Ctrl + Y / Ctrl + Shift + Z', desc: 'Redo action' },
        { key: 'Ctrl + C', desc: 'Copy selected elements' },
        { key: 'Ctrl + V', desc: 'Paste elements (+20px offset)' },
        { key: 'Del / Backspace', desc: 'Delete selected elements (detaches connected arrows)' },
        { key: 'Ctrl + G', desc: 'Group selected elements' },
        { key: 'Ctrl + Shift + G', desc: 'Ungroup selected elements' },
        { key: 'Ctrl + ]', desc: 'Bring to front (top layer)' },
        { key: 'Ctrl + [', desc: 'Send to back (bottom layer)' },
      ],
    },
    {
      title: 'System & Productivity',
      shortcuts: [
        { key: 'Ctrl + K', desc: 'Open Command Palette (20 IT components + tools)' },
        { key: '?', desc: 'Open Keyboard Shortcuts cheat sheet' },
        { key: 'Esc', desc: 'Close dialogs / Cancel action' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-card border rounded-xl shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/40"
                  >
                    <span className="text-foreground">{s.desc}</span>
                    <kbd className="font-mono text-[10px] px-2 py-0.5 rounded bg-card border font-semibold text-foreground">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
