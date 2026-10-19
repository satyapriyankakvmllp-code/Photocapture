// All thresholds live here.
export const CONFIG = {
  minWidth: 640,
  minHeight: 480,
  brightnessMin: 70,      // mean luma (0-255) below = too dark
  brightnessMax: 195,     // above = too bright
  sharpnessMin: 40,       // variance of Laplacian on a 320px-wide frame
  minFaceHeightRatio: 0.25, // face box height / frame height
  centerTolX: 0.12,       // allowed offset of face centre from frame centre (fraction of width)
  centerTolY: 0.16,
  edgeMargin: 0.03,       // face must be this far from every edge
  stableMs: 700,         // face must stay still this long
  moveTolerance: 0.02,    // movement ignored below this fraction of frame width
  consistentFrames: 3,    // consecutive single-face detections required
  detectIntervalMs: 150,
  // Head pose / eyes (from 68 face landmarks). Tune here if auto capture is too strict or too loose.
  yawMin: 0.6, yawMax: 1.67,      // nose position between jaw sides; 1.0 = facing straight
  pitchMin: 0.40, pitchMax: 0.66, // nose height between eyes and mouth; above max = head down
  maxRollDeg: 15,                 // head tilt sideways
  minEyeOpen: 0.17,               // eye aspect ratio; below = eyes closed/not visible
  gazeCheck: true,                // estimate whether the pupils point at the camera (set false to rely on head pose only)
  gazeTolerance: 0.15,            // allowed pupil offset from eye centre (0 = exact centre)
  jpegQuality: 0.92,
};
