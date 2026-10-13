import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ROOM_STATES, RoomState } from '@talk/shared';
import { api } from '../services/api.js';
import { useRoomStore } from '../state/roomStore.js';
import { AvailableScreen } from './RoomGate/AvailableScreen.js';
import { AwaitingCodeScreen } from './RoomGate/AwaitingCodeScreen.js';
import { ProtectedScreen } from './RoomGate/ProtectedScreen.js';
import { ChatRoom } from './Chat/ChatRoom.js';

export const RoomPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [isFull, setIsFull] = useState(false);
  const [salt, setSalt] = useState<string | null>(null);
  const [isInRoom, setIsInRoom] = useState(false);

  const currentSlug = useRoomStore((s) => s.slug);
  const slotIndex = useRoomStore((s) => s.slotIndex);

  const fetchStatus = async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);

    try {
      const cleanSlug = slug.toLowerCase();
      const status = await api.getRoomStatus(cleanSlug);
      setState(status.state);
      setIsFull(status.full);
      setSalt(status.salt ?? null);

      if (status.disappearAfter !== undefined) {
        useRoomStore.getState().setDisappearAfter(status.disappearAfter);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check room status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!slug) return;

    const checkAndRestore = async () => {
      setLoading(true);
      setError(null);

      // 1. Try to restore active session from localStorage & IDB (e.g. on hard refresh)
      const restored = await useRoomStore.getState().restoreSessionFromStorage(slug);
      if (restored) {
        setIsInRoom(true);
        setLoading(false);
        return;
      }

      // 2. If no saved session, check room status from server
      await fetchStatus();
    };

    checkAndRestore();
  }, [slug]);

  // If already joined this room
  useEffect(() => {
    if (currentSlug === slug && slotIndex !== null) {
      setIsInRoom(true);
    }
  }, [currentSlug, slug, slotIndex]);

  if (!slug) {
    navigate('/');
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <span className="text-xs font-mono">Verifying room status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="p-6 bg-dark-800 border border-zinc-800 rounded-xl max-w-sm w-full text-center space-y-4">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => fetchStatus()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Active chat session
  if (isInRoom) {
    return <ChatRoom />;
  }

  // State A: Room link does not exist -> Create room screen
  if (state === ROOM_STATES.AVAILABLE) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <AvailableScreen
          slug={slug}
          onSuccess={(_roomId, slot) => {
            if (slot !== null) {
              setIsInRoom(true);
            } else {
              // Created link only -> now in State B
              fetchStatus();
            }
          }}
        />
      </div>
    );
  }

  // State B: Link exists but no code has been set yet -> Set code screen (first-wins)
  if (state === ROOM_STATES.AWAITING_CODE) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <AwaitingCodeScreen
          slug={slug}
          onSuccess={() => setIsInRoom(true)}
          onSwitchToProtected={() => fetchStatus()}
        />
      </div>
    );
  }

  // State C: Link and code exist -> Enter code to join screen
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <ProtectedScreen
        slug={slug}
        isFull={isFull}
        salt={salt}
        onSuccess={() => setIsInRoom(true)}
      />
    </div>
  );
};
