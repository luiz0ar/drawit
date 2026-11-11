import { describe, it, expect, vi } from 'vitest';
import { IT_COMPONENTS, drawLucideIconNodes } from '../components';

describe('IT Components & Lucide rendering', () => {
  it('has database component defined with ellipse and unified name', () => {
    const db = IT_COMPONENTS.database;
    expect(db).toBeDefined();
    expect(db.key).toBe('database');
    expect(db.name).toBe('Database');
    expect(db.iconNodes.some(([tag]) => tag === 'ellipse')).toBe(true);
  });

  it('uses Layers icon for cache component', () => {
    const cache = IT_COMPONENTS.cache;
    expect(cache).toBeDefined();
    expect(cache.key).toBe('cache');
    expect(cache.iconName).toBe('Layers');
    expect(cache.iconNodes.length).toBe(3);
  });

  it('uses Columns3 icon for queue component', () => {
    const queue = IT_COMPONENTS.queue;
    expect(queue).toBeDefined();
    expect(queue.key).toBe('queue');
    expect(queue.iconName).toBe('Columns3');
    expect(queue.iconNodes.length).toBe(3);
  });

  it('has rabbitmq component defined with Rabbit icon in messaging category', () => {
    const rmq = IT_COMPONENTS.rabbitmq;
    expect(rmq).toBeDefined();
    expect(rmq.key).toBe('rabbitmq');
    expect(rmq.name).toBe('RabbitMQ');
    expect(rmq.category).toBe('messaging');
    expect(rmq.iconName).toBe('Rabbit');
    expect(rmq.iconNodes.length).toBe(5);
  });

  it('draws ellipse for database icon without throwing', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      ellipse: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
    } as unknown as CanvasRenderingContext2D;

    expect(() => {
      drawLucideIconNodes(mockCtx, IT_COMPONENTS.database.iconNodes, 36, 36, 32);
    }).not.toThrow();

    expect(mockCtx.ellipse).toHaveBeenCalledWith(12, 5, 9, 3, 0, 0, Math.PI * 2);
    expect(mockCtx.stroke).toHaveBeenCalled();
  });
});

