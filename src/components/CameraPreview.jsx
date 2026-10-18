import { useEffect, useRef, useState } from 'react';

/**
 * Owns the getUserMedia stream (desktop webcam, phone front/rear camera).
 * facingMode: 'user' (front, default) | 'environment' (rear). deviceId overrides it (desktop with several webcams).
 * The previous stream is always stopped before a new one starts.
 */
export default function CameraPreview({ videoRef, enabled, deviceId, facingMode = 'user', retryKey, onStatus, onDevices, onStart, guide }) {
  const streamRef = useRef(null);
  const [state, setState] = useState({ status: 'idle', detail: '' });
  const [dims, setDims] = useState(null);
  const [mirror, setMirror] = useState(true);

  const update = (status, detail = '', extra = {}) => {
    setState({ status, detail });
    onStatus?.({ status, detail, ...extra });
  };
  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!enabled) { stop(); update('idle'); return; }
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        update('unavailable', 'Camera access needs a secure page. Open the app on https:// or http://localhost.');
        return;
      }
      update('loading');
      try {
        stop(); // release the previous camera first (needed before switching on phones)
        const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
        const video = deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: facingMode }, ...size };
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        if (cancelled || !videoRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        track.addEventListener('ended', () => { if (!cancelled) update('disconnected', 'The camera was disconnected. Reconnect it and press Retry.'); });
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        setMirror((settings.facingMode || (deviceId ? 'user' : facingMode)) !== 'environment'); // mirror selfie view only
        setDims({ w: v.videoWidth, h: v.videoHeight });
        onDevices?.(devs, settings.deviceId, settings.facingMode || facingMode);
        update('ready', '', { width: v.videoWidth, height: v.videoHeight });
      } catch (e) {
        if (cancelled) return;
        const m = {
          NotAllowedError: ['denied', 'Camera permission was denied. Allow camera access in the browser settings, then press Retry.'],
          SecurityError: ['denied', 'Camera permission was denied. Allow camera access in the browser settings, then press Retry.'],
          NotFoundError: ['unavailable', 'No camera was found. Connect a webcam and press Retry.'],
          OverconstrainedError: ['unavailable', 'The selected camera is not available. Press Restart camera or switch camera.'],
          NotReadableError: ['unavailable', 'The camera is in use by another application. Close it and press Retry.'],
        }[e.name] || ['error', `Camera error: ${e.message}`];
        update(m[0], m[1]);
      }
    })();
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, deviceId, facingMode, retryKey]);

  const { status, detail } = state;
  return (
    <div className="cam" style={{ aspectRatio: dims && status === 'ready' ? `${dims.w} / ${dims.h}` : '4 / 3' }}>
      <video ref={videoRef} playsInline muted autoPlay className={`${status === 'ready' ? '' : 'hidden'} ${mirror ? 'mirror' : ''}`} />
      {status === 'ready' && <div className={`guide ${guide || ''}`} aria-hidden="true" />}
      {status === 'loading' && <div className="overlay"><div className="spinner" /><p>Starting camera…</p></div>}
      {status === 'idle' && (
        <div className="overlay"><p>Camera is off.</p><button className="btn primary" onClick={onStart}>Start Camera</button></div>
      )}
      {['denied', 'unavailable', 'disconnected', 'error'].includes(status) && (
        <div className="overlay err"><p>{detail}</p><button className="btn primary" onClick={onStart}>Retry</button></div>
      )}
    </div>
  );
}
