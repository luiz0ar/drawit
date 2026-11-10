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
  // =========================================================================
  // 1. CLIENTS & EDGE (4 components)
  // =========================================================================
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

      ctx.beginPath();
      ctx.moveTo(x, y + 18);
      ctx.lineTo(x + w, y + 18);
      ctx.stroke();

      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + 10 + i * 8, y + 9, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  mobile: {
    key: 'mobile',
    name: 'Mobile App',
    category: 'clients',
    defaultWidth: 64,
    defaultHeight: 100,
    draw: (ctx, x, y, w, h) => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 10) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // Speaker notch
      ctx.beginPath();
      ctx.moveTo(x + w * 0.35, y + 8);
      ctx.lineTo(x + w * 0.65, y + 8);
      ctx.stroke();

      // Screen frame
      ctx.strokeRect(x + 6, y + 14, w - 12, h - 28);

      // Home bar
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h - 7, 3, 0, Math.PI * 2);
      ctx.stroke();
    },
  },

  laptop: {
    key: 'laptop',
    name: 'Desktop / Laptop',
    category: 'clients',
    defaultWidth: 110,
    defaultHeight: 75,
    draw: (ctx, x, y, w, h) => {
      const screenH = h * 0.78;
      const padX = w * 0.1;
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(x + padX, y, w - padX * 2, screenH, 4)
        : ctx.rect(x + padX, y, w - padX * 2, screenH);
      ctx.fill();
      ctx.stroke();

      // Base keyboard deck
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w - padX, y + screenH);
      ctx.lineTo(x + padX, y + screenH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
  },

  user: {
    key: 'user',
    name: 'User / Actor',
    category: 'clients',
    defaultWidth: 70,
    defaultHeight: 85,
    draw: (ctx, x, y, w, h) => {
      const cx = x + w / 2;
      const headR = Math.min(w, h) * 0.22;
      ctx.beginPath();
      ctx.arc(cx, y + headR + 4, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, y + h - 4, w * 0.4, Math.PI, 0, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
  },

  // =========================================================================
  // 2. BACKEND & COMPUTE (5 components)
  // =========================================================================
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

      const slotH = h * 0.22;
      for (let i = 0; i < 3; i++) {
        const sy = y + 8 + i * (slotH + 4);
        ctx.strokeRect(x + 8, sy, w - 16, slotH);
        ctx.beginPath();
        ctx.arc(x + w - 16, sy + slotH / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  microservice: {
    key: 'microservice',
    name: 'Microservice',
    category: 'backend',
    defaultWidth: 85,
    defaultHeight: 85,
    draw: (ctx, x, y, w, h) => {
      // Hexagon
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2;
      const ry = h / 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + rx * Math.cos(angle);
        const py = cy + ry * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner gear/node ring
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(rx, ry) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    },
  },

  worker: {
    key: 'worker',
    name: 'Background Worker',
    category: 'backend',
    defaultWidth: 85,
    defaultHeight: 80,
    draw: (ctx, x, y, w, h) => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) * 0.24;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Gear teeth
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        ctx.lineTo(cx + (r + 6) * Math.cos(a), cy + (r + 6) * Math.sin(a));
        ctx.stroke();
      }
    },
  },

  api_gateway: {
    key: 'api_gateway',
    name: 'API Gateway',
    category: 'backend',
    defaultWidth: 95,
    defaultHeight: 80,
    draw: (ctx, x, y, w, h) => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // Split routing arrows inside
      const midX = x + w * 0.45;
      const cy = y + h / 2;
      ctx.beginPath();
      ctx.moveTo(x + 12, cy);
      ctx.lineTo(midX, cy);
      ctx.lineTo(x + w - 14, y + h * 0.28);
      ctx.moveTo(midX, cy);
      ctx.lineTo(x + w - 14, cy);
      ctx.moveTo(midX, cy);
      ctx.lineTo(x + w - 14, y + h * 0.72);
      ctx.stroke();
    },
  },

  load_balancer: {
    key: 'load_balancer',
    name: 'Load Balancer',
    category: 'backend',
    defaultWidth: 90,
    defaultHeight: 80,
    draw: (ctx, x, y, w, h) => {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Internal distribution nodes
      ctx.beginPath();
      ctx.arc(cx - 12, cy, 4, 0, Math.PI * 2);
      ctx.arc(cx + 10, cy - 10, 4, 0, Math.PI * 2);
      ctx.arc(cx + 10, cy + 10, 4, 0, Math.PI * 2);
      ctx.stroke();
    },
  },

  // =========================================================================
  // 3. DATA & STORAGE (4 components)
  // =========================================================================
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

      ctx.beginPath();
      ctx.ellipse(cx, y + ry, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, y + ry);
      ctx.lineTo(x, y + h - ry);
      ctx.ellipse(cx, y + h - ry, rx, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x + w, y + ry);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(cx, y + h * 0.5, rx, ry, 0, 0, Math.PI);
      ctx.stroke();
    },
  },

  nosql: {
    key: 'nosql',
    name: 'NoSQL Document DB',
    category: 'data',
    defaultWidth: 85,
    defaultHeight: 90,
    draw: (ctx, x, y, w, h) => {
      const rx = w / 2;
      const ry = h * 0.14;
      const cx = x + rx;

      ctx.beginPath();
      ctx.ellipse(cx, y + ry, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, y + ry);
      ctx.lineTo(x, y + h - ry);
      ctx.ellipse(cx, y + h - ry, rx, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x + w, y + ry);
      ctx.fill();
      ctx.stroke();

      // Curly braces { } indicator
      ctx.beginPath();
      ctx.moveTo(cx - 10, y + h * 0.42);
      ctx.lineTo(cx - 14, y + h * 0.55);
      ctx.lineTo(cx - 10, y + h * 0.68);
      ctx.moveTo(cx + 10, y + h * 0.42);
      ctx.lineTo(cx + 14, y + h * 0.55);
      ctx.lineTo(cx + 10, y + h * 0.68);
      ctx.stroke();
    },
  },

  cache: {
    key: 'cache',
    name: 'In-Memory Cache',
    category: 'data',
    defaultWidth: 85,
    defaultHeight: 75,
    draw: (ctx, x, y, w, h) => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // Lightning bolt
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - 18);
      ctx.lineTo(cx - 10, cy + 2);
      ctx.lineTo(cx + 1, cy + 2);
      ctx.lineTo(cx - 4, cy + 18);
      ctx.lineTo(cx + 10, cy - 2);
      ctx.lineTo(cx - 1, cy - 2);
      ctx.closePath();
      ctx.stroke();
    },
  },

  object_storage: {
    key: 'object_storage',
    name: 'Object Storage (Bucket)',
    category: 'data',
    defaultWidth: 85,
    defaultHeight: 85,
    draw: (ctx, x, y, w, h) => {
      // Bucket trapezoid
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 16);
      ctx.lineTo(x + w - 6, y + 16);
      ctx.lineTo(x + w - 14, y + h);
      ctx.lineTo(x + 14, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top rim ellipse
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + 16, (w - 12) / 2, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
  },

  // =========================================================================
  // 4. MESSAGING & STREAMING (2 components)
  // =========================================================================
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

      const step = w / 4;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * step, y);
        ctx.lineTo(x + i * step, y + h);
        ctx.stroke();
      }
    },
  },

  event_stream: {
    key: 'event_stream',
    name: 'Event Stream / Log',
    category: 'messaging',
    defaultWidth: 110,
    defaultHeight: 60,
    draw: (ctx, x, y, w, h) => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 24) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // Parallel topic lanes
      for (let i = 1; i <= 2; i++) {
        const ly = y + (h / 3) * i;
        ctx.beginPath();
        ctx.moveTo(x + 14, ly);
        ctx.lineTo(x + w - 14, ly);
        ctx.stroke();
      }
    },
  },

  // =========================================================================
  // 5. INFRASTRUCTURE & NETWORK (5 components)
  // =========================================================================
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

  cdn: {
    key: 'cdn',
    name: 'CDN / Edge Network',
    category: 'infra',
    defaultWidth: 85,
    defaultHeight: 85,
    draw: (ctx, x, y, w, h) => {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) * 0.42;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Globe meridians & parallels
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
    },
  },

  firewall: {
    key: 'firewall',
    name: 'Firewall / WAF',
    category: 'infra',
    defaultWidth: 80,
    defaultHeight: 85,
    draw: (ctx, x, y, w, h) => {
      const cx = x + w / 2;
      ctx.beginPath();
      ctx.moveTo(cx, y + 4);
      ctx.lineTo(x + w - 6, y + 18);
      ctx.lineTo(x + w - 12, y + h * 0.65);
      ctx.lineTo(cx, y + h - 4);
      ctx.lineTo(x + 12, y + h * 0.65);
      ctx.lineTo(x + 6, y + 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner shield crest
      ctx.beginPath();
      ctx.moveTo(cx, y + 14);
      ctx.lineTo(cx, y + h - 14);
      ctx.stroke();
    },
  },

  container: {
    key: 'container',
    name: 'Container',
    category: 'infra',
    defaultWidth: 95,
    defaultHeight: 65,
    draw: (ctx, x, y, w, h) => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 4) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // Shipping container vertical corrugation ribs
      const count = 5;
      const step = (w - 16) / count;
      for (let i = 0; i <= count; i++) {
        const rx = x + 8 + i * step;
        ctx.beginPath();
        ctx.moveTo(rx, y + 8);
        ctx.lineTo(rx, y + h - 8);
        ctx.stroke();
      }
    },
  },

  kubernetes: {
    key: 'kubernetes',
    name: 'Kubernetes Cluster',
    category: 'infra',
    defaultWidth: 90,
    defaultHeight: 90,
    draw: (ctx, x, y, w, h) => {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) * 0.44;

      // Heptagon / wheel
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = ((Math.PI * 2) / 7) * i - Math.PI / 2;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner helm spokes
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
      for (let i = 0; i < 7; i++) {
        const a = ((Math.PI * 2) / 7) * i - Math.PI / 2;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * 0.8 * Math.cos(a), cy + r * 0.8 * Math.sin(a));
      }
      ctx.stroke();
    },
  },
};
