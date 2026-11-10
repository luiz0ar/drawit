/// <reference types="vite/client" />
import { CanvasElement } from '../canvas/engine/types';

export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';

export interface Board {
  id: string;
  owner_id: string;
  group_id: string | null;
  title: string;
  tags: string[];
  is_favorite: boolean;
  thumbnail: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  owner_id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  board_id: string;
  schema_version: number;
  revision: number;
  elements: CanvasElement[];
  viewport: {
    pan_x: number;
    pan_y: number;
    zoom: number;
  };
  updated_at: string;
}

export interface SaveScenePayload {
  revision: number;
  last_client_save_id?: string;
  content_hash: string;
  elements: CanvasElement[];
  viewport: {
    pan_x: number;
    pan_y: number;
    zoom: number;
  };
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code?: string;
  serverRevision?: number;
  invalidParams?: Array<{ name: string; reason: string }>;
}

export class ApiError extends Error {
  public problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }
}

// Token management
let currentAccessToken: string | null =
  typeof window !== 'undefined' && typeof localStorage !== 'undefined'
    ? localStorage.getItem('drawit_access_token')
    : null;

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    if (token) {
      localStorage.setItem('drawit_access_token', token);
    } else {
      localStorage.removeItem('drawit_access_token');
    }
  }
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (currentAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`);
  }

  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let problem: ProblemDetails;
    try {
      problem = await response.json();
    } catch {
      problem = {
        type: 'about:blank',
        title: response.statusText || 'Error',
        status: response.status,
        detail: `HTTP ${response.status}`,
        instance: endpoint,
      };
    }
    throw new ApiError(problem);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Board API Endpoints
export const BoardApi = {
  list: (trash = false): Promise<Board[]> =>
    request<Board[]>(`/boards?trash=${trash}`),

  create: (title: string, group_id?: string | null): Promise<Board> =>
    request<Board>('/boards', {
      method: 'POST',
      body: JSON.stringify({ title, group_id: group_id || null }),
    }),

  get: (boardId: string): Promise<Board> =>
    request<Board>(`/boards/${boardId}`),

  update: (
    boardId: string,
    updates: { title?: string; group_id?: string | null; is_favorite?: boolean }
  ): Promise<Board> =>
    request<Board>(`/boards/${boardId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (boardId: string): Promise<void> =>
    request<void>(`/boards/${boardId}`, {
      method: 'DELETE',
    }),

  restore: (boardId: string): Promise<void> =>
    request<void>(`/boards/${boardId}/restore`, {
      method: 'POST',
    }),

  getScene: (boardId: string): Promise<Scene> =>
    request<Scene>(`/boards/${boardId}/scene`),

  saveScene: (
    boardId: string,
    payload: SaveScenePayload
  ): Promise<{ status: string; revision: number }> =>
    request<{ status: string; revision: number }>(`/boards/${boardId}/scene`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};

// Group API Endpoints
export const GroupApi = {
  list: (): Promise<Group[]> => request<Group[]>('/groups'),

  create: (name: string, color?: string): Promise<Group> =>
    request<Group>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),

  update: (
    groupId: string,
    updates: { name?: string; color?: string }
  ): Promise<Group> =>
    request<Group>(`/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (groupId: string, boardsAction: 'move' | 'trash' = 'move'): Promise<void> =>
    request<void>(`/groups/${groupId}?boards=${boardsAction}`, {
      method: 'DELETE',
    }),
};
