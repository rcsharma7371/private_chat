import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, PhoneCall, ShieldCheck, Activity } from 'lucide-react';
import { useCallStore } from '../../state/callStore.js';
import { useRoomStore } from '../../state/roomStore.js';
import { webrtcService } from '../../services/webrtc.js';

export const CallModal: React.FC = () => {
  const {
    isCallModalOpen,
    isIncomingCall,
    isOutgoingCall,
    isCallConnected,
    callType,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoMuted,
    connectionQuality,
    toggleAudio,
    toggleVideo,
  } = useCallStore();

  const sas = useRoomStore((s) => s.sas);
  const peerDisplayName = useRoomStore((s) => s.peerDisplayName);

  const [autoplayBlocked, setAutoplayBlocked] = React.useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const setLocalVideoRef = (el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el && localStream) {
      if (el.srcObject !== localStream) {
        el.srcObject = localStream;
      }
      el.play().catch((e) => console.warn('[Local Video Play]', e));
    }
  };

  const setRemoteVideoRef = (el: HTMLVideoElement | null) => {
    remoteVideoRef.current = el;
    if (el && remoteStream) {
      if (el.srcObject !== remoteStream) {
        el.srcObject = remoteStream;
      }
      el.play().catch((e) => {
        if (e.name === 'NotAllowedError') setAutoplayBlocked(true);
        console.warn('[Remote Video Play]', e);
      });
    }
  };

  const setRemoteAudioRef = (el: HTMLAudioElement | null) => {
    remoteAudioRef.current = el;
    if (el && remoteStream) {
      if (el.srcObject !== remoteStream) {
        el.srcObject = remoteStream;
      }
      el.play().catch((e) => {
        if (e.name === 'NotAllowedError') setAutoplayBlocked(true);
        console.warn('[Remote Audio Play]', e);
      });
    }
  };

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      localVideoRef.current.play().catch((e) => console.warn('[Local Video Play]', e));
    }
  }, [localStream, isCallConnected, isCallModalOpen]);

  useEffect(() => {
    if (remoteStream) {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch((e) => {
          if (e.name === 'NotAllowedError') setAutoplayBlocked(true);
          console.warn('[Remote Video Play]', e);
        });
      }
      if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch((e) => {
          if (e.name === 'NotAllowedError') setAutoplayBlocked(true);
          console.warn('[Remote Audio Play]', e);
        });
      }
    }
  }, [remoteStream, isCallConnected, isCallModalOpen]);

  if (!isCallModalOpen) return null;

  const hasLocalVideo = !!localStream?.getVideoTracks().some((t) => t.readyState === 'live');

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-4 md:p-6 animate-in fade-in duration-200">
      {/* Autoplay prompt banner if mobile browser blocks audio */}
      {autoplayBlocked && (
        <div className="absolute inset-x-4 top-16 z-30 flex justify-center">
          <button
            type="button"
            onClick={() => {
              remoteVideoRef.current?.play().catch(() => {});
              remoteAudioRef.current?.play().catch(() => {});
              setAutoplayBlocked(false);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-2xl animate-pulse"
          >
            🔊 Tap to enable audio & video playback
          </button>
        </div>
      )}

      {/* Top Header: Peer Info & SAS Call Fingerprint */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 z-10 bg-dark-900/90 border border-zinc-800 p-2.5 sm:p-3 rounded-xl max-w-3xl mx-auto w-full backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-xs sm:text-sm text-zinc-100 truncate max-w-[200px]">
            {peerDisplayName || 'Peer'} ({callType === 'video' ? 'Video' : 'Voice'})
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-[11px] sm:text-xs text-zinc-400 flex items-center gap-1">
            <Activity className="w-3 h-3 text-emerald-400" />
            {connectionQuality}
          </span>
        </div>

        {/* Call Authentication Fingerprint */}
        {sas && (
          <div className="flex items-center gap-1.5 sm:gap-2 bg-dark-800 px-2.5 py-1 rounded-lg border border-zinc-700/60 text-[11px] sm:text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-zinc-400">SAS:</span>
            <span className="font-mono text-emerald-300 font-bold tracking-wider">{sas.code}</span>
            <span>{sas.emojis.slice(0, 2).join('')}</span>
          </div>
        )}
      </div>

      {/* Main Video/Audio Grid */}
      <div className="flex-1 flex items-center justify-center relative my-2 sm:my-4 max-w-4xl mx-auto w-full min-h-0">
        {isIncomingCall ? (
          <div className="text-center space-y-4 p-6 sm:p-8 bg-dark-800/95 border border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
              <PhoneCall className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Incoming {callType} Call</h3>
              <p className="text-xs text-zinc-400 mt-1">From {peerDisplayName || 'Peer'}</p>
            </div>
            <div className="flex justify-center gap-3 sm:gap-4 pt-2">
              <button
                type="button"
                onClick={() => webrtcService.acceptIncomingCall()}
                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-xs sm:text-sm transition shadow-lg shadow-emerald-900/30"
              >
                <PhoneCall className="w-4 h-4" /> Answer
              </button>
              <button
                type="button"
                onClick={() => webrtcService.endCall()}
                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-red-600/80 hover:bg-red-600 text-white font-medium rounded-xl text-xs sm:text-sm transition shadow-lg shadow-red-900/30"
              >
                <PhoneOff className="w-4 h-4" /> Decline
              </button>
            </div>
          </div>
        ) : isOutgoingCall && !isCallConnected ? (
          <div className="text-center space-y-3 p-6 sm:p-8 bg-dark-800/90 border border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto animate-pulse">
              <PhoneCall className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-white">Calling {peerDisplayName || 'Peer'}...</h3>
            <p className="text-xs text-zinc-400">Waiting for peer to accept encrypted media</p>
          </div>
        ) : (
          <div className="relative w-full h-full max-h-[75dvh] sm:max-h-[70vh] bg-dark-900 rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center">
            {/* Always include audio element for voice calls or as audio backup */}
            <audio ref={setRemoteAudioRef} autoPlay playsInline />

            {callType === 'video' ? (
              <>
                {/* Remote Video */}
                <video
                  ref={setRemoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Local Video PiP */}
                <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 w-28 h-38 sm:w-44 sm:h-60 rounded-xl overflow-hidden border-2 border-emerald-500/50 shadow-2xl bg-black flex items-center justify-center">
                  {hasLocalVideo ? (
                    <video
                      ref={setLocalVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  ) : (
                    <div className="text-center p-2 text-zinc-400 text-xs flex flex-col items-center gap-1">
                      <Mic className="w-5 h-5 text-emerald-400" />
                      <span>Audio only</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Voice Call Visualizer */
              <div className="text-center space-y-4 p-6">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-3xl">
                  🎙️
                </div>
                <p className="text-sm font-medium text-zinc-200">Voice call active</p>
                <p className="text-xs text-emerald-400 font-mono">DTLS-SRTP peer encrypted</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-center gap-3 sm:gap-4 z-10 pb-2 sm:pb-0">
        <button
          type="button"
          onClick={toggleAudio}
          className={`p-3 sm:p-3.5 rounded-full transition shadow-md ${
            isAudioMuted ? 'bg-red-600/80 text-white' : 'bg-dark-800 hover:bg-dark-700 text-zinc-200 border border-zinc-700'
          }`}
          title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {callType === 'video' && (
          <button
            type="button"
            onClick={toggleVideo}
            className={`p-3 sm:p-3.5 rounded-full transition shadow-md ${
              isVideoMuted ? 'bg-red-600/80 text-white' : 'bg-dark-800 hover:bg-dark-700 text-zinc-200 border border-zinc-700'
            }`}
            title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>
        )}

        <button
          type="button"
          onClick={() => webrtcService.endCall()}
          className="p-3 sm:p-3.5 rounded-full bg-red-600 hover:bg-red-500 text-white transition shadow-lg shadow-red-950/50"
          title="End Call"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
