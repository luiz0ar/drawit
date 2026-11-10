/// <reference types="vite/client" />
import { CanvasElement } from '../canvas/engine/types';

export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';

export interface UserProfile {
  id: string;
  username: string;
  preferences: {
    theme?: 'light' | 'dark' | 'system';
    language?: string;
  };
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

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
  last_opened_at?: string | null;
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
  thumbnail?: string;
}

export interface BoardVersion {
  id: string;
  board_id: string;
  revision: number;
  label: string | null;
  created_at: string;
}

export interface TagCount {
  tag: string;
  count: number;
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
  invalid_params?: Array<{ name: string; reason: string }>;
}

export class ApiError extends Error {
  public problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }
}

// Strictly in-memory token management (Spec §5.1 compliance — never stored in localStorage)
let currentAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function setOnUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function performTokenRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        currentAccessToken = null;
        return null;
      }
      const data: AuthResponse = await response.json();
      currentAccessToken = data.access_token;
      return data.access_token;
    } catch {
      currentAccessToken = null;
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
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

  if (
    response.status === 401 &&
    !isRetry &&
    !endpoint.startsWith('/auth/login') &&
    !endpoint.startsWith('/auth/register') &&
    !endpoint.startsWith('/auth/refresh')
  ) {
    const newToken = await performTokenRefresh();
    if (newToken) {
      const retryHeaders = new Headers(options.headers || {});
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      return request<T>(endpoint, { ...options, headers: retryHeaders }, true);
    } else {
      unauthorizedHandler?.();
    }
  }

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

// Auth API Endpoints
export const AuthApi = {
  register: async (username: string, password: string): Promise<AuthResponse> => {
    const res = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setAccessToken(res.access_token);
    return res;
  },

  login: async (username: string, password: string): Promise<AuthResponse> => {
    const res = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setAccessToken(res.access_token);
    return res;
  },

  refresh: async (): Promise<AuthResponse> => {
    const res = await request<AuthResponse>('/auth/refresh', {
      method: 'POST',
    });
    setAccessToken(res.access_token);
    return res;
  },

  logout: async (): Promise<void> => {
    try {
      await request<void>('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
    }
  },

  logoutAll: async (): Promise<void> => {
    try {
      await request<void>('/auth/logout-all', { method: 'POST' });
    } finally {
      setAccessToken(null);
    }
  },

  changePassword: (current_password: string, new_password: string): Promise<void> =>
    request<void>('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password, new_password }),
    }),

  me: (): Promise<UserProfile> => request<UserProfile>('/auth/me'),

  updatePreferences: (prefs: { theme?: string; language?: string }): Promise<UserProfile> =>
    request<UserProfile>('/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),
};

export interface ListBoardsParams {
  trash?: boolean;
  group_id?: string | null;
  tags?: string[];
  q?: string;
  favorite?: boolean;
  sort?: string;
}

// Board API Endpoints
export const BoardApi = {
  list: (params: boolean | ListBoardsParams = false): Promise<Board[]> => {
    if (typeof params === 'boolean') {
      return request<Board[]>(`/boards?trash=${params}`);
    }
    const qs = new URLSearchParams();
    if (params.trash !== undefined) qs.set('trash', String(params.trash));
    if (params.group_id !== undefined && params.group_id !== null) {
      qs.set('group_id', params.group_id);
    }
    if (params.tags && params.tags.length > 0) {
      qs.set('tags', params.tags.join(','));
    }
    if (params.q && params.q.trim()) {
      qs.set('q', params.q.trim());
    }
    if (params.favorite !== undefined) {
      qs.set('favorite', String(params.favorite));
    }
    if (params.sort) {
      qs.set('sort', params.sort);
    }
    const queryStr = qs.toString();
    return request<Board[]>(`/boards${queryStr ? `?${queryStr}` : ''}`);
  },

  create: (title: string, group_id?: string | null): Promise<Board> =>
    request<Board>('/boards', {
      method: 'POST',
      body: JSON.stringify({ title, group_id: group_id || null }),
    }),

  get: (boardId: string): Promise<Board> =>
    request<Board>(`/boards/${boardId}`),

  update: (
    boardId: string,
    updates: {
      title?: string;
      group_id?: string | null;
      tags?: string[];
      is_favorite?: boolean;
      thumbnail?: string | null;
    }
  ): Promise<Board> =>
    request<Board>(`/boards/${boardId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  duplicate: (boardId: string): Promise<Board> =>
    request<Board>(`/boards/${boardId}/duplicate`, {
      method: 'POST',
    }),

  delete: (boardId: string): Promise<void> =>
    request<void>(`/boards/${boardId}`, {
      method: 'DELETE',
    }),

  permanentDelete: (boardId: string): Promise<void> =>
    request<void>(`/boards/${boardId}/permanent`, {
      method: 'DELETE',
    }),

  restore: (boardId: string): Promise<void> =>
    request<void>(`/boards/${boardId}/restore`, {
      method: 'POST',
    }),

  emptyTrash: (): Promise<{ deleted_count: number }> =>
    request<{ deleted_count: number }>('/trash/empty', {
      method: 'POST',
    }),

  listTags: (): Promise<TagCount[]> => request<TagCount[]>('/tags'),

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

  listVersions: (boardId: string): Promise<BoardVersion[]> =>
    request<BoardVersion[]>(`/boards/${boardId}/versions`),

  createVersion: (boardId: string, label?: string): Promise<BoardVersion> =>
    request<BoardVersion>(`/boards/${boardId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  restoreVersion: (boardId: string, versionId: string): Promise<Scene> =>
    request<Scene>(`/boards/${boardId}/versions/${versionId}/restore`, {
      method: 'POST',
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
