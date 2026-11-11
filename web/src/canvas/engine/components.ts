export type ComponentCategory =
  | 'clients'
  | 'backend'
  | 'data'
  | 'messaging'
  | 'infra';

export type LucideElementDef = [string, Record<string, string>];

export interface ITComponentDefinition {
  key: string;
  name: string;
  category: ComponentCategory;
  defaultWidth: number;
  defaultHeight: number;
  iconName: string;
  iconNodes: LucideElementDef[];
  draw: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => void;
}

/**
 * Draws crisp Lucide-react vector icon nodes onto Canvas 2D.
 */
export function drawLucideIconNodes(
  ctx: CanvasRenderingContext2D,
  nodes: LucideElementDef[],
  cx: number,
  cy: number,
  size: number
) {
  ctx.save();
  const scale = size / 24;
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [tag, attrs] of nodes) {
    ctx.beginPath();
    if (tag === 'rect') {
      const rx = parseFloat(attrs.rx || '0');
      const x = parseFloat(attrs.x || '0');
      const y = parseFloat(attrs.y || '0');
      const w = parseFloat(attrs.width || '0');
      const h = parseFloat(attrs.height || '0');
      if (rx && ctx.roundRect) {
        ctx.roundRect(x, y, w, h, rx);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.stroke();
    } else if (tag === 'circle') {
      const cx = parseFloat(attrs.cx || '0');
      const cy = parseFloat(attrs.cy || '0');
      const r = parseFloat(attrs.r || '0');
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tag === 'ellipse') {
      const cx = parseFloat(attrs.cx || '0');
      const cy = parseFloat(attrs.cy || '0');
      const rx = parseFloat(attrs.rx || '0');
      const ry = parseFloat(attrs.ry || '0');
      if (typeof ctx.ellipse === 'function') {
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      } else {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, ry / (rx || 1));
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.restore();
      }
      ctx.stroke();
    } else if (tag === 'line') {
      const x1 = parseFloat(attrs.x1 || '0');
      const y1 = parseFloat(attrs.y1 || '0');
      const x2 = parseFloat(attrs.x2 || '0');
      const y2 = parseFloat(attrs.y2 || '0');
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (tag === 'path') {
      if (typeof Path2D !== 'undefined' && attrs.d) {
        ctx.stroke(new Path2D(attrs.d));
      }
    } else if (tag === 'polygon' || tag === 'polyline') {
      const points = (attrs.points || '').trim().split(/\s+/).map((pair) => {
        const [px, py] = pair.split(',').map(parseFloat);
        return { x: px, y: py };
      });
      if (points.length > 1) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        if (tag === 'polygon') ctx.closePath();
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

function createLucideComponent(
  key: string,
  name: string,
  category: ComponentCategory,
  iconName: string,
  iconNodes: LucideElementDef[],
  defaultWidth = 72,
  defaultHeight = 72
): ITComponentDefinition {
  return {
    key,
    name,
    category,
    defaultWidth,
    defaultHeight,
    iconName,
    iconNodes,
    draw: (ctx, x, y, w, h) => {
      // 1. Sleek rounded container card
      ctx.beginPath();
      const radius = Math.min(12, Math.min(w, h) * 0.18);
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, radius);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fill();
      ctx.stroke();

      // 2. Centered Lucide vector icon
      const iconSize = Math.min(w, h) * 0.46;
      drawLucideIconNodes(ctx, iconNodes, x + w / 2, y + h / 2, iconSize);
    },
  };
}

export const IT_COMPONENTS: Record<string, ITComponentDefinition> = {
  browser: createLucideComponent(
    'browser',
    'Browser',
    'clients',
    'Globe',
    [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10",
          "key": "1mglay"
        }
      ],
      [
        "path",
        {
          "d": "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",
          "key": "13o1zl"
        }
      ],
      [
        "path",
        {
          "d": "M2 12h20",
          "key": "9i4pu4"
        }
      ]
    ],
    72,
    72
  ),

  mobile: createLucideComponent(
    'mobile',
    'Mobile App',
    'clients',
    'Smartphone',
    [
      [
        "rect",
        {
          "width": "14",
          "height": "20",
          "x": "5",
          "y": "2",
          "rx": "2",
          "ry": "2",
          "key": "1yt0o3"
        }
      ],
      [
        "path",
        {
          "d": "M12 18h.01",
          "key": "mhygvu"
        }
      ]
    ],
    72,
    72
  ),

  laptop: createLucideComponent(
    'laptop',
    'Desktop App',
    'clients',
    'Laptop',
    [
      [
        "path",
        {
          "d": "M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16",
          "key": "tarvll"
        }
      ]
    ],
    72,
    72
  ),

  user: createLucideComponent(
    'user',
    'User',
    'clients',
    'User',
    [
      [
        "path",
        {
          "d": "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
          "key": "975kel"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "7",
          "r": "4",
          "key": "17ys0d"
        }
      ]
    ],
    72,
    72
  ),

  server: createLucideComponent(
    'server',
    'Server',
    'backend',
    'Server',
    [
      [
        "rect",
        {
          "width": "20",
          "height": "8",
          "x": "2",
          "y": "2",
          "rx": "2",
          "ry": "2",
          "key": "ngkwjq"
        }
      ],
      [
        "rect",
        {
          "width": "20",
          "height": "8",
          "x": "2",
          "y": "14",
          "rx": "2",
          "ry": "2",
          "key": "iecqi9"
        }
      ],
      [
        "line",
        {
          "x1": "6",
          "x2": "6.01",
          "y1": "6",
          "y2": "6",
          "key": "16zg32"
        }
      ],
      [
        "line",
        {
          "x1": "6",
          "x2": "6.01",
          "y1": "18",
          "y2": "18",
          "key": "nzw8ys"
        }
      ]
    ],
    72,
    72
  ),

  microservice: createLucideComponent(
    'microservice',
    'Microservice',
    'backend',
    'Cpu',
    [
      [
        "rect",
        {
          "width": "16",
          "height": "16",
          "x": "4",
          "y": "4",
          "rx": "2",
          "key": "14l7u7"
        }
      ],
      [
        "rect",
        {
          "width": "6",
          "height": "6",
          "x": "9",
          "y": "9",
          "rx": "1",
          "key": "5aljv4"
        }
      ],
      [
        "path",
        {
          "d": "M15 2v2",
          "key": "13l42r"
        }
      ],
      [
        "path",
        {
          "d": "M15 20v2",
          "key": "15mkzm"
        }
      ],
      [
        "path",
        {
          "d": "M2 15h2",
          "key": "1gxd5l"
        }
      ],
      [
        "path",
        {
          "d": "M2 9h2",
          "key": "1bbxkp"
        }
      ],
      [
        "path",
        {
          "d": "M20 15h2",
          "key": "19e6y8"
        }
      ],
      [
        "path",
        {
          "d": "M20 9h2",
          "key": "19tzq7"
        }
      ],
      [
        "path",
        {
          "d": "M9 2v2",
          "key": "165o2o"
        }
      ],
      [
        "path",
        {
          "d": "M9 20v2",
          "key": "i2bqo8"
        }
      ]
    ],
    72,
    72
  ),

  worker: createLucideComponent(
    'worker',
    'Background Worker',
    'backend',
    'Cog',
    [
      [
        "path",
        {
          "d": "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
          "key": "sobvz5"
        }
      ],
      [
        "path",
        {
          "d": "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
          "key": "11i496"
        }
      ],
      [
        "path",
        {
          "d": "M12 2v2",
          "key": "tus03m"
        }
      ],
      [
        "path",
        {
          "d": "M12 22v-2",
          "key": "1osdcq"
        }
      ],
      [
        "path",
        {
          "d": "m17 20.66-1-1.73",
          "key": "eq3orb"
        }
      ],
      [
        "path",
        {
          "d": "M11 10.27 7 3.34",
          "key": "16pf9h"
        }
      ],
      [
        "path",
        {
          "d": "m20.66 17-1.73-1",
          "key": "sg0v6f"
        }
      ],
      [
        "path",
        {
          "d": "m3.34 7 1.73 1",
          "key": "1ulond"
        }
      ],
      [
        "path",
        {
          "d": "M14 12h8",
          "key": "4f43i9"
        }
      ],
      [
        "path",
        {
          "d": "M2 12h2",
          "key": "1t8f8n"
        }
      ],
      [
        "path",
        {
          "d": "m20.66 7-1.73 1",
          "key": "1ow05n"
        }
      ],
      [
        "path",
        {
          "d": "m3.34 17 1.73-1",
          "key": "nuk764"
        }
      ],
      [
        "path",
        {
          "d": "m17 3.34-1 1.73",
          "key": "2wel8s"
        }
      ],
      [
        "path",
        {
          "d": "m11 13.73-4 6.93",
          "key": "794ttg"
        }
      ]
    ],
    72,
    72
  ),

  api_gateway: createLucideComponent(
    'api_gateway',
    'API Gateway',
    'backend',
    'Network',
    [
      [
        "rect",
        {
          "x": "16",
          "y": "16",
          "width": "6",
          "height": "6",
          "rx": "1",
          "key": "4q2zg0"
        }
      ],
      [
        "rect",
        {
          "x": "2",
          "y": "16",
          "width": "6",
          "height": "6",
          "rx": "1",
          "key": "8cvhb9"
        }
      ],
      [
        "rect",
        {
          "x": "9",
          "y": "2",
          "width": "6",
          "height": "6",
          "rx": "1",
          "key": "1egb70"
        }
      ],
      [
        "path",
        {
          "d": "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3",
          "key": "1jsf9p"
        }
      ],
      [
        "path",
        {
          "d": "M12 12V8",
          "key": "2874zd"
        }
      ]
    ],
    72,
    72
  ),

  load_balancer: createLucideComponent(
    'load_balancer',
    'Load Balancer',
    'backend',
    'GitFork',
    [
      [
        "circle",
        {
          "cx": "12",
          "cy": "18",
          "r": "3",
          "key": "1mpf1b"
        }
      ],
      [
        "circle",
        {
          "cx": "6",
          "cy": "6",
          "r": "3",
          "key": "1lh9wr"
        }
      ],
      [
        "circle",
        {
          "cx": "18",
          "cy": "6",
          "r": "3",
          "key": "1h7g24"
        }
      ],
      [
        "path",
        {
          "d": "M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9",
          "key": "1uq4wg"
        }
      ],
      [
        "path",
        {
          "d": "M12 12v3",
          "key": "158kv8"
        }
      ]
    ],
    72,
    72
  ),

  database: createLucideComponent(
    'database',
    'Database',
    'data',
    'Database',
    [
      [
        "ellipse",
        {
          "cx": "12",
          "cy": "5",
          "rx": "9",
          "ry": "3",
          "key": "msslwz"
        }
      ],
      [
        "path",
        {
          "d": "M3 5V19A9 3 0 0 0 21 19V5",
          "key": "1wlel7"
        }
      ],
      [
        "path",
        {
          "d": "M3 12A9 3 0 0 0 21 12",
          "key": "mv7ke4"
        }
      ]
    ],
    72,
    72
  ),

  cache: createLucideComponent(
    'cache',
    'Cache',
    'data',
    'Layers',
    [
      [
        "path",
        {
          "d": "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",
          "key": "8b97xw"
        }
      ],
      [
        "path",
        {
          "d": "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65",
          "key": "dd6zsq"
        }
      ],
      [
        "path",
        {
          "d": "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",
          "key": "ep9fru"
        }
      ]
    ],
    72,
    72
  ),

  object_storage: createLucideComponent(
    'object_storage',
    'Object Storage',
    'data',
    'HardDrive',
    [
      [
        "line",
        {
          "x1": "22",
          "x2": "2",
          "y1": "12",
          "y2": "12",
          "key": "1y58io"
        }
      ],
      [
        "path",
        {
          "d": "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
          "key": "oot6mr"
        }
      ],
      [
        "line",
        {
          "x1": "6",
          "x2": "6.01",
          "y1": "16",
          "y2": "16",
          "key": "sgf278"
        }
      ],
      [
        "line",
        {
          "x1": "10",
          "x2": "10.01",
          "y1": "16",
          "y2": "16",
          "key": "1l4acy"
        }
      ]
    ],
    72,
    72
  ),

  queue: createLucideComponent(
    'queue',
    'Message Queue',
    'messaging',
    'Columns3',
    [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2",
          "key": "afitv7"
        }
      ],
      [
        "path",
        {
          "d": "M9 3v18",
          "key": "fh3hqa"
        }
      ],
      [
        "path",
        {
          "d": "M15 3v18",
          "key": "14nvp0"
        }
      ]
    ],
    72,
    72
  ),

  event_stream: createLucideComponent(
    'event_stream',
    'Event Stream',
    'messaging',
    'Activity',
    [
      [
        "path",
        {
          "d": "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
          "key": "169zse"
        }
      ]
    ],
    72,
    72
  ),

  rabbitmq: createLucideComponent(
    'rabbitmq',
    'RabbitMQ',
    'messaging',
    'Rabbit',
    [
      [
        "path",
        {
          "d": "M13 16a3 3 0 0 1 2.24 5",
          "key": "1epib5"
        }
      ],
      [
        "path",
        {
          "d": "M18 12h.01",
          "key": "yjnet6"
        }
      ],
      [
        "path",
        {
          "d": "M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3",
          "key": "ue9ozu"
        }
      ],
      [
        "path",
        {
          "d": "M20 8.54V4a2 2 0 1 0-4 0v3",
          "key": "49iql8"
        }
      ],
      [
        "path",
        {
          "d": "M7.612 12.524a3 3 0 1 0-1.6 4.3",
          "key": "1e33i0"
        }
      ]
    ],
    72,
    72
  ),

  cloud: createLucideComponent(
    'cloud',
    'Cloud Infrastructure',
    'infra',
    'Cloud',
    [
      [
        "path",
        {
          "d": "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z",
          "key": "p7xjir"
        }
      ]
    ],
    72,
    72
  ),

  cdn: createLucideComponent(
    'cdn',
    'CDN / Edge',
    'infra',
    'Radio',
    [
      [
        "path",
        {
          "d": "M4.9 19.1C1 15.2 1 8.8 4.9 4.9",
          "key": "1vaf9d"
        }
      ],
      [
        "path",
        {
          "d": "M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5",
          "key": "u1ii0m"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "2",
          "key": "1c9p78"
        }
      ],
      [
        "path",
        {
          "d": "M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5",
          "key": "1j5fej"
        }
      ],
      [
        "path",
        {
          "d": "M19.1 4.9C23 8.8 23 15.1 19.1 19",
          "key": "10b0cb"
        }
      ]
    ],
    72,
    72
  ),

  firewall: createLucideComponent(
    'firewall',
    'Firewall / WAF',
    'infra',
    'Shield',
    [
      [
        "path",
        {
          "d": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
          "key": "oel41y"
        }
      ]
    ],
    72,
    72
  ),

  container: createLucideComponent(
    'container',
    'Container',
    'infra',
    'Box',
    [
      [
        "path",
        {
          "d": "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
          "key": "hh9hay"
        }
      ],
      [
        "path",
        {
          "d": "m3.3 7 8.7 5 8.7-5",
          "key": "g66t2b"
        }
      ],
      [
        "path",
        {
          "d": "M12 22V12",
          "key": "d0xqtd"
        }
      ]
    ],
    72,
    72
  ),

  kubernetes: createLucideComponent(
    'kubernetes',
    'Kubernetes Cluster',
    'infra',
    'Orbit',
    [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "3",
          "key": "1v7zrd"
        }
      ],
      [
        "circle",
        {
          "cx": "19",
          "cy": "5",
          "r": "2",
          "key": "mhkx31"
        }
      ],
      [
        "circle",
        {
          "cx": "5",
          "cy": "19",
          "r": "2",
          "key": "v8kfzx"
        }
      ],
      [
        "path",
        {
          "d": "M10.4 21.9a10 10 0 0 0 9.941-15.416",
          "key": "eohfx2"
        }
      ],
      [
        "path",
        {
          "d": "M13.5 2.1a10 10 0 0 0-9.841 15.416",
          "key": "19pvbm"
        }
      ]
    ],
    72,
    72
  ),

};
