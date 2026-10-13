import {
  CreateRoomInput,
  JoinRoomInput,
  RoomStatusResponse,
  SetCodeInput,
  TurnCredentialsResponse,
} from '@talk/shared';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // If Authorization header is not set, look up active token from localStorage
  if (!headers.Authorization && !headers.authorization) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('talk_session_')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.token) {
              headers.Authorization = `Bearer ${parsed.token}`;
              break;
            }
          }
        }
      }
    } catch (_) {}
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = data?.error || `Request failed with status ${res.status}`;
    const error: any = new Error(errorMsg);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export const api = {
  getRoomStatus: (slug: string) =>
    request<RoomStatusResponse & { salt?: string | null }>(`/api/rooms/${slug}/status`),

  createRoom: (body: CreateRoomInput) =>
    request<{ room: { id: string; slug: string; state: string }; token: string | null; slotIndex: number | null }>(
      '/api/rooms',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  setRoomCode: (slug: string, body: SetCodeInput) =>
    request<{ room: { id: string; slug: string; state: string }; token: string; slotIndex: number }>(
      `/api/rooms/${slug}/code`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  joinRoom: (slug: string, body: JoinRoomInput) =>
    request<{
      room: { id: string; slug: string };
      token: string;
      slotIndex: number;
      peer: any | null;
    }>(`/api/rooms/${slug}/join`, { method: 'POST', body: JSON.stringify(body) }),

  leaveRoom: (slug: string) =>
    request<{ success: boolean }>(`/api/rooms/${slug}/leave`, { method: 'POST' }),

  burnRoom: (slug: string) =>
    request<{ destroyed: boolean }>(`/api/rooms/${slug}`, { method: 'DELETE' }),

  getRoomMessages: (slug: string, after = 0) =>
    request<{
      messages: Array<{
        id: string;
        senderSlot: number;
        counter: number;
        iv: string;
        ciphertext: string;
        createdAt: string;
        expiresAt: string | null;
      }>;
    }>(`/api/rooms/${slug}/messages?after=${after}`),

  updateDisappearing: (slug: string, disappearAfter: number) =>
    request<{ disappearAfter: number | null }>(`/api/rooms/${slug}/disappear`, {
      method: 'PATCH',
      body: JSON.stringify({ disappearAfter }),
    }),

  getTurnCredentials: () =>
    request<TurnCredentialsResponse>('/api/turn-credentials'),
};
