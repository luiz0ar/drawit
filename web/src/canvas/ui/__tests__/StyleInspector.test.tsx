import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StyleInspector } from '../StyleInspector';
import { CanvasElement } from '../../engine/types';

describe('StyleInspector', () => {
  const mockTextElement: CanvasElement = {
    id: 'text-1',
    type: 'text',
    text: 'Hello World',
    label: 'Hello World',
    fontFamily: 'sans',
    fontSize: 20,
    textAlign: 'left',
    x: 0,
    y: 0,
    width: 100,
    height: 30,
    rotation: 0,
    zIndex: 1,
    groupIds: [],
    locked: false,
    style: {
      strokeColor: '#000000',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      opacity: 100,
      effect: { type: 'none', intensity: 0 },
    },
    version: 1,
  };

  const mockRectElement: CanvasElement = {
    id: 'rect-1',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex: 1,
    groupIds: [],
    locked: false,
    style: {
      strokeColor: '#000000',
      fillColor: '#ffffff',
      strokeWidth: 2,
      strokeStyle: 'solid',
      opacity: 100,
      effect: { type: 'none', intensity: 0 },
    },
    version: 1,
  };

  it('hides Fill Color, Width, Stroke, and Visual Effect when a text element is selected', () => {
    render(
      <StyleInspector
        selectedElements={[mockTextElement]}
        onUpdateStyle={vi.fn()}
        onUpdateRouting={vi.fn()}
        onUpdateFontSize={vi.fn()}
        onEditText={vi.fn()}
        onToggleLock={vi.fn()}
        onDuplicate={vi.fn()}
        onGroup={vi.fn()}
        onUngroup={vi.fn()}
        onBringToFront={vi.fn()}
        onSendToBack={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Text Color and Text Size should be present
    expect(screen.getByText('Text Color')).toBeDefined();
    expect(screen.getByText('Text Size')).toBeDefined();

    // Fill Color, Width, Stroke, and Visual Effect must be hidden
    expect(screen.queryByText('Fill Color')).toBeNull();
    expect(screen.queryByText('Width')).toBeNull();
    expect(screen.queryByText('Stroke')).toBeNull();
    expect(screen.queryByText('Visual Effect')).toBeNull();
  });

  it('shows Fill Color, Width, Stroke, and Visual Effect when a shape element is selected', () => {
    render(
      <StyleInspector
        selectedElements={[mockRectElement]}
        onUpdateStyle={vi.fn()}
        onUpdateRouting={vi.fn()}
        onUpdateFontSize={vi.fn()}
        onEditText={vi.fn()}
        onToggleLock={vi.fn()}
        onDuplicate={vi.fn()}
        onGroup={vi.fn()}
        onUngroup={vi.fn()}
        onBringToFront={vi.fn()}
        onSendToBack={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Stroke Color')).toBeDefined();
    expect(screen.getByText('Fill Color')).toBeDefined();
    expect(screen.getByText('Width')).toBeDefined();
    expect(screen.getByText('Stroke')).toBeDefined();
    expect(screen.getByText('Visual Effect')).toBeDefined();
  });
});
