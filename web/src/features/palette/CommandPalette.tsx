import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  MousePointer2,
  Hand,
  Square,
  Circle,
  Diamond,
  Triangle,
  Minus,
  ArrowRight,
  Database,
  Server,
  Globe,
  Layers,
  Cloud,
  Download,
  Upload,
  FileCode,
  Maximize2,
  HelpCircle,
  Copy,
  ChevronRight,
  Type,
  StickyNote,
  PenTool,
  Eraser,
  Cpu,
} from 'lucide-react';
import { Tool } from '../../canvas/engine/CanvasEngine';
import { IT_COMPONENTS } from '../../canvas/engine/components';

export interface CommandItem {
  id: string;
  title: string;
  category: 'Tools' | 'IT Architecture' | 'Arrange' | 'Export / Import' | 'Help';
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (tool: Tool) => void;
  onResetZoom: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onOpenShortcuts: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTool,
  onResetZoom,
  onExportPng,
  onExportSvg,
  onExportJson,
  onImportJson,
  onGroupSelected,
  onUngroupSelected,
  onBringToFront,
  onSendToBack,
  onOpenShortcuts,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commands: CommandItem[] = useMemo(() => {
    const itComponentCommands: CommandItem[] = Object.values(IT_COMPONENTS).map((comp) => ({
      id: `it-${comp.key}`,
      title: `${comp.name} (${comp.category})`,
      category: 'IT Architecture',
      icon:
        comp.category === 'data'
          ? Database
          : comp.category === 'backend'
            ? Server
            : comp.category === 'clients'
              ? Globe
              : comp.category === 'messaging'
                ? Layers
                : comp.category === 'infra'
                  ? Cloud
                  : Cpu,
      action: () => onSelectTool(comp.key as Tool),
    }));

    return [
      // Tools
      {
        id: 'tool-select',
        title: 'Select / Pointer Tool',
        category: 'Tools',
        icon: MousePointer2,
        shortcut: 'V',
        action: () => onSelectTool('select'),
      },
      {
        id: 'tool-hand',
        title: 'Hand / Pan Canvas Tool',
        category: 'Tools',
        icon: Hand,
        shortcut: 'H',
        action: () => onSelectTool('hand'),
      },
      {
        id: 'tool-rectangle',
        title: 'Rectangle',
        category: 'Tools',
        icon: Square,
        shortcut: 'R',
        action: () => onSelectTool('rectangle'),
      },
      {
        id: 'tool-ellipse',
        title: 'Ellipse / Circle',
        category: 'Tools',
        icon: Circle,
        shortcut: 'O',
        action: () => onSelectTool('ellipse'),
      },
      {
        id: 'tool-diamond',
        title: 'Diamond / Decision Node',
        category: 'Tools',
        icon: Diamond,
        shortcut: 'D',
        action: () => onSelectTool('diamond'),
      },
      {
        id: 'tool-triangle',
        title: 'Triangle',
        category: 'Tools',
        icon: Triangle,
        action: () => onSelectTool('triangle'),
      },
      {
        id: 'tool-line',
        title: 'Line',
        category: 'Tools',
        icon: Minus,
        action: () => onSelectTool('line'),
      },
      {
        id: 'tool-arrow',
        title: 'Magnetic Arrow Connector',
        category: 'Tools',
        icon: ArrowRight,
        shortcut: 'A',
        action: () => onSelectTool('arrow'),
      },
      {
        id: 'tool-text',
        title: 'Text Label',
        category: 'Tools',
        icon: Type,
        shortcut: 'T',
        action: () => onSelectTool('text'),
      },
      {
        id: 'tool-sticky',
        title: 'Sticky Note',
        category: 'Tools',
        icon: StickyNote,
        shortcut: 'S',
        action: () => onSelectTool('sticky'),
      },
      {
        id: 'tool-freehand',
        title: 'Freehand Pencil',
        category: 'Tools',
        icon: PenTool,
        shortcut: 'P',
        action: () => onSelectTool('freehand'),
      },
      {
        id: 'tool-eraser',
        title: 'Eraser Tool',
        category: 'Tools',
        icon: Eraser,
        shortcut: 'E',
        action: () => onSelectTool('eraser'),
      },

      // All 20 IT Components
      ...itComponentCommands,

      // Arrange
      {
        id: 'arrange-group',
        title: 'Group Selected Elements',
        category: 'Arrange',
        icon: Copy,
        shortcut: 'Ctrl+G',
        action: onGroupSelected,
      },
      {
        id: 'arrange-ungroup',
        title: 'Ungroup Selected Elements',
        category: 'Arrange',
        icon: Layers,
        shortcut: 'Ctrl+Shift+G',
        action: onUngroupSelected,
      },
      {
        id: 'arrange-front',
        title: 'Bring to Front',
        category: 'Arrange',
        icon: ChevronRight,
        shortcut: 'Ctrl+]',
        action: onBringToFront,
      },
      {
        id: 'arrange-back',
        title: 'Send to Back',
        category: 'Arrange',
        icon: ChevronRight,
        shortcut: 'Ctrl+[',
        action: onSendToBack,
      },
      {
        id: 'view-reset',
        title: 'Reset View (Zoom 100%)',
        category: 'Arrange',
        icon: Maximize2,
        action: onResetZoom,
      },

      // Export / Import
      {
        id: 'export-png',
        title: 'Export as PNG',
        category: 'Export / Import',
        icon: Download,
        action: onExportPng,
      },
      {
        id: 'export-svg',
        title: 'Export as SVG Vector',
        category: 'Export / Import',
        icon: FileCode,
        action: onExportSvg,
      },
      {
        id: 'export-json',
        title: 'Export .drawit JSON File',
        category: 'Export / Import',
        icon: Download,
        action: onExportJson,
      },
      {
        id: 'import-json',
        title: 'Import .drawit JSON File',
        category: 'Export / Import',
        icon: Upload,
        action: onImportJson,
      },

      // Help
      {
        id: 'help-shortcuts',
        title: 'Keyboard Shortcuts Cheat Sheet',
        category: 'Help',
        icon: HelpCircle,
        shortcut: '?',
        action: onOpenShortcuts,
      },
    ];
  }, [
    onSelectTool,
    onResetZoom,
    onExportPng,
    onExportSvg,
    onExportJson,
    onImportJson,
    onGroupSelected,
    onUngroupSelected,
    onBringToFront,
    onSendToBack,
    onOpenShortcuts,
  ]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev === 0 ? filteredCommands.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-background/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-card border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b">
          <Search className="w-4 h-4 text-muted-foreground mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search 20 IT components..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No matching commands found.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${isSelected
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-foreground hover:bg-muted'
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{cmd.title}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase tracking-wider ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`}
                    >
                      {cmd.category}
                    </span>
                    {cmd.shortcut && (
                      <kbd
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isSelected
                            ? 'bg-primary-foreground/20 border-primary-foreground/30 text-primary-foreground'
                            : 'bg-muted border-border text-muted-foreground'
                          }`}
                      >
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
