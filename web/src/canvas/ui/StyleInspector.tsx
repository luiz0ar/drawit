import React from 'react';
import {
  Lock,
  Unlock,
  Trash2,
  Copy,
  Layers,
  ArrowUpToLine,
  ArrowDownToLine,
  Sparkles,
  Type,
} from 'lucide-react';
import { CanvasElement, ElementStyle, StrokeStyle } from '../engine/types';

interface StyleInspectorProps {
  selectedElements: CanvasElement[];
  onUpdateStyle: (partial: Partial<ElementStyle>) => void;
  onUpdateRouting: (routing: 'straight' | 'orthogonal' | 'curved') => void;
  onUpdateFontSize?: (fontSize: number) => void;
  onEditText: (element: CanvasElement) => void;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDelete: () => void;
}

const STROKE_COLORS = [
  '#1e293b',
  '#f8fafc',
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#db2777',
];

const FILL_COLORS = [
  'transparent',
  '#ffffff',
  '#0f172a',
  '#dbeafe',
  '#d1fae5',
  '#fef08a',
  '#fee2e2',
  '#f3e8ff',
];

export const StyleInspector: React.FC<StyleInspectorProps> = ({
  selectedElements,
  onUpdateStyle,
  onUpdateRouting,
  onUpdateFontSize,
  onEditText,
  onToggleLock,
  onDuplicate,
  onGroup,
  onUngroup,
  onBringToFront,
  onSendToBack,
  onDelete,
}) => {
  if (selectedElements.length === 0) return null;

  const primary = selectedElements[0];
  const style = primary.style;
  const allLocked = selectedElements.every((el) => el.locked);
  const hasArrow = selectedElements.some((el) => el.type === 'arrow');
  const hasTextOrLabel = selectedElements.some(
    (el) => el.type === 'text' || el.type === 'sticky' || Boolean(el.label)
  );
  const currentFontSize =
    (primary as any).fontSize || (primary.type === 'text' ? 20 : 14);
  const currentRouting = (primary as any).routing || 'straight';

  return (
    <div className="absolute right-4 top-16 z-20 w-64 rounded-xl border bg-card/95 backdrop-blur shadow-xl p-3.5 text-foreground space-y-3.5 animate-in fade-in slide-in-from-right-2 duration-150">
      {/* Header & Quick Actions */}
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {selectedElements.length === 1
            ? primary.type.toUpperCase()
            : `${selectedElements.length} Selected`}
        </span>
        <div className="flex items-center gap-1">
          {selectedElements.length === 1 && (
            <button
              onClick={() => onEditText(primary)}
              title="Edit Label / Text (Double-click)"
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Type className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onToggleLock}
            title={allLocked ? 'Unlock Element' : 'Lock Element'}
            className={`p-1.5 rounded transition-colors ${
              allLocked
                ? 'bg-amber-500/15 text-amber-500'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {allLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onDuplicate}
            title="Duplicate (Ctrl+C / Ctrl+V)"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            title="Delete (Del)"
            className="p-1.5 rounded hover:bg-destructive/15 text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stroke Color */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground block">
          Stroke Color
        </label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STROKE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdateStyle({ strokeColor: c })}
              className={`w-5 h-5 rounded-full border transition-transform ${
                style.strokeColor === c ? 'scale-110 ring-2 ring-primary ring-offset-1' : ''
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Fill Color */}
      {primary.type !== 'arrow' && primary.type !== 'line' && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground block">
            Fill Color
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILL_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onUpdateStyle({ fillColor: c })}
                className={`w-5 h-5 rounded-full border transition-transform ${
                  style.fillColor === c ? 'scale-110 ring-2 ring-primary ring-offset-1' : ''
                }`}
                style={{
                  backgroundColor: c === 'transparent' ? 'transparent' : c,
                  backgroundImage:
                    c === 'transparent'
                      ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
                      : undefined,
                  backgroundSize: c === 'transparent' ? '6px 6px' : undefined,
                }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stroke Width & Style */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground block">
            Width
          </label>
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {[1, 2, 4, 6].map((w) => (
              <button
                key={w}
                onClick={() => onUpdateStyle({ strokeWidth: w })}
                className={`flex-1 py-1 text-[11px] rounded font-medium transition-colors ${
                  style.strokeWidth === w
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {w}px
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground block">
            Stroke
          </label>
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {(['solid', 'dashed', 'dotted'] as StrokeStyle[]).map((s) => (
              <button
                key={s}
                onClick={() => onUpdateStyle({ strokeStyle: s })}
                className={`flex-1 py-1 text-[10px] capitalize rounded font-medium transition-colors ${
                  style.strokeStyle === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.slice(0, 4)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Font / Text Size Control */}
      {hasTextOrLabel && onUpdateFontSize && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Type className="w-3 h-3" />
            <span>Text Size</span>
          </label>
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {[
              { label: 'S', size: 14 },
              { label: 'M', size: 20 },
              { label: 'L', size: 28 },
              { label: 'XL', size: 40 },
            ].map(({ label, size }) => (
              <button
                key={label}
                onClick={() => onUpdateFontSize(size)}
                className={`flex-1 py-1 text-[11px] rounded font-medium transition-colors ${
                  currentFontSize === size
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Arrow Routing Mode (RF-E06) */}
      {hasArrow && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground block">
            Connector Routing
          </label>
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {(['straight', 'orthogonal', 'curved'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onUpdateRouting(r)}
                className={`flex-1 py-1 text-[11px] capitalize rounded font-medium transition-colors ${
                  currentRouting === r
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r === 'orthogonal' ? 'Ortho' : r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Visual Effects (RNF-S05) */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          <span>Visual Effect</span>
        </label>
        <div className="flex rounded-lg border bg-muted/40 p-0.5">
          {(['none', 'neon', 'shadow'] as const).map((eff) => (
            <button
              key={eff}
              onClick={() =>
                onUpdateStyle({
                  effect: {
                    type: eff,
                    intensity: eff === 'none' ? 0 : 12,
                    color: style.strokeColor,
                  },
                })
              }
              className={`flex-1 py-1 text-[11px] capitalize rounded font-medium transition-colors ${
                (style.effect?.type || 'none') === eff
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {eff}
            </button>
          ))}
        </div>
      </div>

      {/* Opacity Slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <span>Opacity</span>
          <span>{style.opacity}%</span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={style.opacity}
          onChange={(e) => onUpdateStyle({ opacity: Number(e.target.value) })}
          className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
        />
      </div>

      {/* Layer Ordering & Grouping */}
      <div className="pt-2 border-t flex items-center justify-between gap-1">
        <button
          onClick={onBringToFront}
          title="Bring to Front (Ctrl+])"
          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded border bg-muted/30 hover:bg-muted text-[11px] font-medium transition-colors"
        >
          <ArrowUpToLine className="w-3.5 h-3.5" />
          <span>Front</span>
        </button>
        <button
          onClick={onSendToBack}
          title="Send to Back (Ctrl+[)"
          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded border bg-muted/30 hover:bg-muted text-[11px] font-medium transition-colors"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
        {selectedElements.length >= 2 && (
          <button
            onClick={onGroup}
            title="Group Selected (Ctrl+G)"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded border bg-muted/30 hover:bg-muted text-[11px] font-medium transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Group</span>
          </button>
        )}
        {selectedElements.some((el) => el.groupIds && el.groupIds.length > 0) && (
          <button
            onClick={onUngroup}
            title="Ungroup (Ctrl+Shift+G)"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded border bg-muted/30 hover:bg-muted text-[11px] font-medium transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Ungroup</span>
          </button>
        )}
      </div>
    </div>
  );
};

