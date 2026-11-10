export type ComponentCategory =
  | 'clients'
  | 'backend'
  | 'data'
  | 'messaging'
  | 'infra';

export interface ITComponentDefinition {
  key: string;
  name: string;
  category: ComponentCategory;
  defaultWidth: number;
  defaultHeight: number;
  draw: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => void;
}

export const IT_COMPONENTS: Record<string, ITComponentDefinition> = {
  // Data: Database (SQL) - Cylinder
  database: {
    key: 'database',
    name: 'Database (SQL)',
    category: 'data',
    defaultWidth: 80,
    defaultHeight: 90,
    draw: (ctx, x, y, w, h) => {
      const rx = w / 2;
      const ry = h * 0.15;
      const cx = x + rx;

      // Top ellipse
      ctx.beginPath();
      ctx.ellipse(cx, y + ry, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Body lines
      ctx.beginPath();
      ctx.moveTo(x, y + ry);
      ctx.lineTo(x, y + h - ry);
      ctx.ellipse(cx, y + h - ry, rx, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x + w, y + ry);
      ctx.fill();
      ctx.stroke();

      // Middle rib
      ctx.beginPath();
      ctx.ellipse(cx, y + h * 0.5, rx, ry, 0, 0, Math.PI);
      ctx.stroke();
    },
  },

  // Backend: Server
  server: {
    key: 'server',
    name: 'Server',
    category: 'backend',
    defaultWidth: 90,
    defaultHeight: 80,
    draw: (ctx, x, y, w, h) => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // Server rack horizontal slots
      const slotH = h * 0.22;
      for (let i = 0; i < 3; i++) {
        const sy = y + 8 + i * (slotH + 4);
        ctx.strokeRect(x + 8, sy, w - 16, slotH);

        // LED light
        ctx.beginPath();
        ctx.arc(x + w - 16, sy + slotH / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  // Clients: Browser / Web Client
  browser: {
    key: 'browser',
    name: 'Browser / Web Client',
    category: 'clients',
    defaultWidth: 100,
    defaultHeight: 75,
    draw: (ctx, x, y, w, h) => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // Top address bar header
      ctx.beginPath();
      ctx.moveTo(x, y + 18);
      ctx.lineTo(x + w, y + 18);
      ctx.stroke();

      // 3 dots
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + 10 + i * 8, y + 9, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  // Messaging: Message Queue
  queue: {
    key: 'queue',
    name: 'Message Queue',
    category: 'messaging',
    defaultWidth: 100,
    defaultHeight: 50,
    draw: (ctx, x, y, w, h) => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // Internal message partitions
      const step = w / 4;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * step, y);
        ctx.lineTo(x + i * step, y + h);
        ctx.stroke();
      }
    },
  },

  // Infra: Cloud
  cloud: {
    key: 'cloud',
    name: 'Cloud Infrastructure',
    category: 'infra',
    defaultWidth: 100,
    defaultHeight: 65,
    draw: (ctx, x, y, w, h) => {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.beginPath();
      ctx.arc(cx - 20, cy + 5, 20, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(cx - 10, cy - 15, 22, Math.PI * 0.9, Math.PI * 1.9);
      ctx.arc(cx + 15, cy - 10, 24, Math.PI * 1.3, Math.PI * 0.2);
      ctx.arc(cx + 25, cy + 8, 18, Math.PI * 1.7, Math.PI * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
  },
};
