import { api } from './api.js';
import { getSocket } from './socket.js';
import { useRoomStore } from '../state/roomStore.js';
import { useCallStore } from '../state/callStore.js';
import { encryptSignal, decryptSignal } from '../crypto/e2ee.js';

interface PendingOfferData {
  type: RTCSdpType;
  sdp: string;
  callType?: 'video' | 'voice';
}

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private signalCounter = 0;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private pendingOffer: PendingOfferData | null = null;

  private async createPeerConnection(): Promise<RTCPeerConnection> {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        console.warn('[WebRTC] Previous connection close:', e);
      }
      this.peerConnection = null;
    }

    const { relayOnlyMode } = useCallStore.getState();

    // Always include resilient public STUN and TURN fallback servers for NAT traversal
    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:openrelay.metered.ca:80' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ];

    try {
      const turnResp = await api.getTurnCredentials();
      if (turnResp.iceServers && Array.isArray(turnResp.iceServers)) {
        for (const server of turnResp.iceServers as RTCIceServer[]) {
          // If accessing over non-localhost (like ngrok or LAN), omit localhost STUN/TURN servers
          const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
          const hasLocalhost = urls.some((u) => u.includes('localhost') || u.includes('127.0.0.1'));
          const isLocalhostHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

          if (!hasLocalhost || isLocalhostHost) {
            iceServers.push(server);
          }
        }
      }
    } catch (err) {
      console.warn('[WebRTC] Could not fetch dynamic TURN credentials; using fallback STUN/TURN', err);
    }

    const config: RTCConfiguration = {
      iceServers,
      iceTransportPolicy: relayOnlyMode ? 'relay' : 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    };

    console.log('[WebRTC] Initializing RTCPeerConnection with ICE servers:', iceServers.map((s) => s.urls));
    const pc = new RTCPeerConnection(config);
    this.peerConnection = pc;

    // Stream handling
    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack received remote track:', event.track.kind, 'id:', event.track.id);
      let remoteStream = event.streams[0];
      if (!remoteStream) {
        const currentStream = useCallStore.getState().remoteStream;
        if (currentStream) {
          currentStream.addTrack(event.track);
          remoteStream = currentStream;
        } else {
          remoteStream = new MediaStream([event.track]);
        }
      }
      useCallStore.getState().setRemoteStream(remoteStream);
      useCallStore.getState().setConnected();
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await this.sendEncryptedSignal('ice', event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] Connection state changed:', state);
      if (state === 'connected') {
        useCallStore.getState().setConnected();
      } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        useCallStore.getState().setConnectionQuality('poor');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        useCallStore.getState().setConnected();
      } else if (pc.iceConnectionState === 'failed') {
        useCallStore.getState().setConnectionQuality('poor');
      }
    };

    return pc;
  }

  private async acquireLocalMedia(
    type: 'video' | 'voice'
  ): Promise<{ stream: MediaStream | null; acquiredVideo: boolean }> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'MediaDevices API unavailable. Calls require a secure origin (HTTPS or localhost). Please ensure you are opening the link using https://.'
      );
    }

    if (type === 'video') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'user' },
        });
        return { stream, acquiredVideo: true };
      } catch (e1) {
        console.warn('[WebRTC] User-facing video failed, trying basic video:', e1);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          });
          return { stream, acquiredVideo: true };
        } catch (e2) {
          console.warn('[WebRTC] Video failed, attempting audio-only fallback:', e2);
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          return { stream, acquiredVideo: false };
        }
      }
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      return { stream, acquiredVideo: false };
    }
  }

  private async sendEncryptedSignal(type: 'offer' | 'answer' | 'ice', data: unknown) {
    const { sessionKeys } = useRoomStore.getState();
    const socket = getSocket();
    if (!sessionKeys || !socket) {
      console.warn('[WebRTC] Cannot send signal: sessionKeys or socket missing');
      return;
    }

    this.signalCounter++;
    const encrypted = await encryptSignal(sessionKeys.signalingKey, this.signalCounter, data);

    socket.emit(`call:${type}`, {
      type,
      ...encrypted,
    });
  }

  public async startCall(type: 'video' | 'voice') {
    useCallStore.getState().openOutgoingCall(type);

    let stream: MediaStream | null = null;
    let acquiredVideo = false;

    try {
      const media = await this.acquireLocalMedia(type);
      stream = media.stream;
      acquiredVideo = media.acquiredVideo;
      if (stream) {
        useCallStore.getState().setLocalStream(stream);
      }
    } catch (err: any) {
      console.error('[WebRTC] Start call media error:', err);
      alert(`Could not access microphone/camera: ${err?.message || 'Permission denied'}`);
      this.endCall();
      return;
    }

    try {
      const pc = await this.createPeerConnection();
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream!));
      }

      // Add transceivers to receive remote audio/video tracks
      const transceivers = pc.getTransceivers();
      if (!transceivers.some((t) => t.receiver.track.kind === 'audio')) {
        pc.addTransceiver('audio', { direction: stream ? 'sendrecv' : 'recvonly' });
      }
      if (!transceivers.some((t) => t.receiver.track.kind === 'video')) {
        pc.addTransceiver('video', { direction: stream && acquiredVideo ? 'sendrecv' : 'recvonly' });
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await this.sendEncryptedSignal('offer', {
        type: offer.type,
        sdp: offer.sdp,
        callType: type,
      });
    } catch (err: any) {
      console.error('[WebRTC] Start call error:', err);
      alert(`Could not start call: ${err?.message || 'Connection setup failed'}`);
      this.endCall();
    }
  }

  public async handleIncomingOffer(encryptedPayload: any) {
    const { sessionKeys } = useRoomStore.getState();
    if (!sessionKeys) {
      console.warn('[WebRTC] handleIncomingOffer: sessionKeys missing');
      return;
    }

    try {
      const decrypted = await decryptSignal(
        sessionKeys.signalingKey,
        encryptedPayload.counter,
        encryptedPayload.iv,
        encryptedPayload.ciphertext
      );

      console.log('[WebRTC] Incoming offer received, type:', decrypted.callType);
      this.pendingOffer = {
        type: decrypted.type,
        sdp: decrypted.sdp,
        callType: decrypted.callType || 'video',
      };

      useCallStore.getState().setIncomingCall(this.pendingOffer.callType || 'video');
    } catch (err) {
      console.error('[WebRTC] Failed to decrypt incoming offer:', err);
    }
  }

  public async acceptIncomingCall() {
    const pendingOffer = this.pendingOffer;
    if (!pendingOffer) {
      console.warn('[WebRTC] acceptIncomingCall called without pendingOffer');
      return;
    }

    const callType = pendingOffer.callType || 'video';
    let stream: MediaStream | null = null;
    let acquiredVideo = false;

    try {
      const media = await this.acquireLocalMedia(callType);
      stream = media.stream;
      acquiredVideo = media.acquiredVideo;
      if (stream) {
        useCallStore.getState().setLocalStream(stream);
      }
    } catch (mediaErr: any) {
      console.warn('[WebRTC] Answering in receive-only mode due to media error:', mediaErr);
      // Receiver can still watch and hear caller even if local mic/cam is unavailable
    }

    try {
      const pc = await this.createPeerConnection();
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream!));
      }

      // Add transceivers so remote audio and video are negotiated
      const transceivers = pc.getTransceivers();
      if (!transceivers.some((t) => t.receiver.track.kind === 'audio')) {
        pc.addTransceiver('audio', { direction: stream ? 'sendrecv' : 'recvonly' });
      }
      if (!transceivers.some((t) => t.receiver.track.kind === 'video')) {
        pc.addTransceiver('video', { direction: stream && acquiredVideo ? 'sendrecv' : 'recvonly' });
      }

      // Set remote description using clean RTCSessionDescriptionInit
      await pc.setRemoteDescription({
        type: pendingOffer.type,
        sdp: pendingOffer.sdp,
      });

      // Process any buffered ICE candidates safely
      for (const cand of this.pendingCandidates) {
        try {
          if (cand && (cand.candidate || cand.candidate === '')) {
            await pc.addIceCandidate(cand);
          }
        } catch (candErr) {
          console.warn('[WebRTC] Error adding buffered candidate:', candErr);
        }
      }
      this.pendingCandidates = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await this.sendEncryptedSignal('answer', {
        type: answer.type,
        sdp: answer.sdp,
      });

      useCallStore.getState().setConnected();
      this.pendingOffer = null;
    } catch (err: any) {
      console.error('[WebRTC] Accept call error:', err);
      alert(`Could not establish call: ${err?.message || 'Connection failed'}`);
      this.endCall();
    }
  }

  public async handleIncomingAnswer(encryptedPayload: any) {
    const { sessionKeys } = useRoomStore.getState();
    if (!sessionKeys || !this.peerConnection) return;

    try {
      const decrypted = await decryptSignal(
        sessionKeys.signalingKey,
        encryptedPayload.counter,
        encryptedPayload.iv,
        encryptedPayload.ciphertext
      );

      console.log('[WebRTC] Incoming answer received. Setting remote description...');
      await this.peerConnection.setRemoteDescription({
        type: decrypted.type,
        sdp: decrypted.sdp,
      });

      // Process any buffered ICE candidates
      for (const cand of this.pendingCandidates) {
        try {
          if (cand && (cand.candidate || cand.candidate === '')) {
            await this.peerConnection.addIceCandidate(cand);
          }
        } catch (candErr) {
          console.warn('[WebRTC] Error adding buffered candidate on answer:', candErr);
        }
      }
      this.pendingCandidates = [];

      useCallStore.getState().setConnected();
    } catch (err) {
      console.error('[WebRTC] Failed to handle answer:', err);
    }
  }

  public async handleIncomingIce(encryptedPayload: any) {
    const { sessionKeys } = useRoomStore.getState();
    if (!sessionKeys) return;

    try {
      const candidateInit = await decryptSignal(
        sessionKeys.signalingKey,
        encryptedPayload.counter,
        encryptedPayload.iv,
        encryptedPayload.ciphertext
      );

      if (this.peerConnection && this.peerConnection.remoteDescription) {
        try {
          await this.peerConnection.addIceCandidate(candidateInit);
        } catch (iceErr) {
          console.warn('[WebRTC] Error applying incoming ICE candidate:', iceErr);
        }
      } else {
        this.pendingCandidates.push(candidateInit);
      }
    } catch (err) {
      console.error('[WebRTC] Failed to handle ICE candidate:', err);
    }
  }

  public endCall() {
    const socket = getSocket();
    if (socket) {
      socket.emit('call:end');
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        console.warn('[WebRTC] PeerConnection close error:', e);
      }
      this.peerConnection = null;
    }

    this.pendingCandidates = [];
    this.pendingOffer = null;
    useCallStore.getState().endCall();
  }

  public handlePeerEndedCall() {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        console.warn('[WebRTC] PeerConnection close error:', e);
      }
      this.peerConnection = null;
    }
    this.pendingCandidates = [];
    this.pendingOffer = null;
    useCallStore.getState().endCall();
  }
}

export const webrtcService = new WebRTCService();
