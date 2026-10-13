import { create } from 'zustand';

interface CallStoreState {
  isCallModalOpen: boolean;
  isIncomingCall: boolean;
  isOutgoingCall: boolean;
  isCallConnected: boolean;
  callType: 'video' | 'voice';

  localStream: MediaStream | null;
  remoteStream: MediaStream | null;

  isAudioMuted: boolean;
  isVideoMuted: boolean;
  relayOnlyMode: boolean; // "Hide my IP" relay-only mode

  connectionQuality: 'excellent' | 'good' | 'poor' | 'connecting';

  openOutgoingCall: (type: 'video' | 'voice') => void;
  setIncomingCall: (type: 'video' | 'voice') => void;
  setConnected: () => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setRelayOnlyMode: (enabled: boolean) => void;
  setConnectionQuality: (quality: 'excellent' | 'good' | 'poor' | 'connecting') => void;
  endCall: () => void;
}

export const useCallStore = create<CallStoreState>((set, get) => ({
  isCallModalOpen: false,
  isIncomingCall: false,
  isOutgoingCall: false,
  isCallConnected: false,
  callType: 'video',

  localStream: null,
  remoteStream: null,

  isAudioMuted: false,
  isVideoMuted: false,
  relayOnlyMode: false,

  connectionQuality: 'connecting',

  openOutgoingCall: (type) => {
    set({
      isCallModalOpen: true,
      isOutgoingCall: true,
      isIncomingCall: false,
      isCallConnected: false,
      callType: type,
      connectionQuality: 'connecting',
    });
  },

  setIncomingCall: (type) => {
    set({
      isCallModalOpen: true,
      isIncomingCall: true,
      isOutgoingCall: false,
      isCallConnected: false,
      callType: type,
      connectionQuality: 'connecting',
    });
  },

  setConnected: () => {
    set({
      isCallConnected: true,
      isIncomingCall: false,
      isOutgoingCall: false,
      connectionQuality: 'excellent',
    });
  },

  setLocalStream: (stream) => {
    set({ localStream: stream });
  },

  setRemoteStream: (stream) => {
    set({ remoteStream: stream });
  },

  toggleAudio: () => {
    const { localStream, isAudioMuted } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = isAudioMuted;
      });
    }
    set({ isAudioMuted: !isAudioMuted });
  },

  toggleVideo: () => {
    const { localStream, isVideoMuted } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = isVideoMuted;
      });
    }
    set({ isVideoMuted: !isVideoMuted });
  },

  setRelayOnlyMode: (enabled) => {
    set({ relayOnlyMode: enabled });
  },

  setConnectionQuality: (quality) => {
    set({ connectionQuality: quality });
  },

  endCall: () => {
    const { localStream, remoteStream } = get();
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((t) => t.stop());
    }

    set({
      isCallModalOpen: false,
      isIncomingCall: false,
      isOutgoingCall: false,
      isCallConnected: false,
      localStream: null,
      remoteStream: null,
      isAudioMuted: false,
      isVideoMuted: false,
      connectionQuality: 'connecting',
    });
  },
}));
