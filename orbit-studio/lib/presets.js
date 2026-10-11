'use strict';

// Camera motion presets. `css` describes the mock preview animation applied
// to the reference image; `hfName` is the name matched against the provider's
// motion catalog in live mode.
const MOTIONS = [
  { id: 'crash_zoom', name: 'Crash Zoom', hfName: 'Crash Zoom In', group: 'Zoom', description: 'Snaps violently toward the subject.', css: { from: 'scale(1)', to: 'scale(1.7)', easing: 'cubic-bezier(.8,0,.9,1)' } },
  { id: 'dolly_in', name: 'Dolly In', hfName: 'Dolly In', group: 'Dolly', description: 'Smooth, slow push toward the subject.', css: { from: 'scale(1)', to: 'scale(1.25)', easing: 'ease-in-out' } },
  { id: 'dolly_out', name: 'Dolly Out', hfName: 'Dolly Out', group: 'Dolly', description: 'Pulls back to reveal the scene.', css: { from: 'scale(1.3)', to: 'scale(1)', easing: 'ease-in-out' } },
  { id: 'super_dolly_in', name: 'Super Dolly In', hfName: 'Super Dolly In', group: 'Dolly', description: 'Extreme push that fills the frame.', css: { from: 'scale(1)', to: 'scale(2.2)', easing: 'ease-in' } },
  { id: 'dolly_zoom', name: 'Dolly Zoom', hfName: 'Dolly Zoom', group: 'Dolly', description: 'Vertigo effect, background stretches while subject holds.', css: { from: 'perspective(600px) translateZ(0) scale(1)', to: 'perspective(600px) translateZ(120px) scale(.92)', easing: 'ease-in-out' } },
  { id: 'orbit_360', name: '360 Orbit', hfName: '360 Orbit', group: 'Orbit', description: 'Circles fully around the subject.', css: { from: 'perspective(800px) rotateY(-18deg) scale(1.15)', to: 'perspective(800px) rotateY(18deg) scale(1.15)', easing: 'linear' } },
  { id: 'arc_left', name: 'Arc Left', hfName: 'Arc Left', group: 'Orbit', description: 'Sweeps around the subject to the left.', css: { from: 'perspective(800px) rotateY(0) translateX(0) scale(1.1)', to: 'perspective(800px) rotateY(14deg) translateX(-6%) scale(1.15)', easing: 'ease-in-out' } },
  { id: 'arc_right', name: 'Arc Right', hfName: 'Arc Right', group: 'Orbit', description: 'Sweeps around the subject to the right.', css: { from: 'perspective(800px) rotateY(0) translateX(0) scale(1.1)', to: 'perspective(800px) rotateY(-14deg) translateX(6%) scale(1.15)', easing: 'ease-in-out' } },
  { id: 'bullet_time', name: 'Bullet Time', hfName: 'Bullet Time', group: 'Orbit', description: 'Frozen moment, camera wheels around.', css: { from: 'perspective(700px) rotateY(-25deg) rotateZ(-2deg) scale(1.2)', to: 'perspective(700px) rotateY(25deg) rotateZ(2deg) scale(1.2)', easing: 'cubic-bezier(.4,0,.2,1)' } },
  { id: 'fpv_drone', name: 'FPV Drone', hfName: 'FPV Drone', group: 'Aerial', description: 'Fast, banking first-person drone dive.', css: { from: 'translate(6%,-6%) rotate(-4deg) scale(1.3)', to: 'translate(-6%,6%) rotate(4deg) scale(1.05)', easing: 'cubic-bezier(.3,.7,.4,1)' } },
  { id: 'crane_up', name: 'Crane Up', hfName: 'Crane Up', group: 'Aerial', description: 'Rises above the scene.', css: { from: 'translateY(8%) scale(1.25)', to: 'translateY(-8%) scale(1.1)', easing: 'ease-in-out' } },
  { id: 'crane_down', name: 'Crane Down', hfName: 'Crane Down', group: 'Aerial', description: 'Descends onto the subject.', css: { from: 'translateY(-8%) scale(1.1)', to: 'translateY(8%) scale(1.25)', easing: 'ease-in-out' } },
  { id: 'earth_zoom_out', name: 'Earth Zoom Out', hfName: 'Earth Zoom Out', group: 'Aerial', description: 'Pulls back from close-up to orbit.', css: { from: 'scale(3)', to: 'scale(1)', easing: 'cubic-bezier(.2,.8,.2,1)' } },
  { id: 'whip_pan', name: 'Whip Pan', hfName: 'Whip Pan', group: 'Pan', description: 'Blistering horizontal whip.', css: { from: 'translateX(12%) scale(1.3)', to: 'translateX(-12%) scale(1.3)', easing: 'cubic-bezier(.9,0,.1,1)', blur: true } },
  { id: 'pan_left', name: 'Pan Left', hfName: 'Pan Left', group: 'Pan', description: 'Slow lateral pan to the left.', css: { from: 'translateX(5%) scale(1.15)', to: 'translateX(-5%) scale(1.15)', easing: 'linear' } },
  { id: 'pan_right', name: 'Pan Right', hfName: 'Pan Right', group: 'Pan', description: 'Slow lateral pan to the right.', css: { from: 'translateX(-5%) scale(1.15)', to: 'translateX(5%) scale(1.15)', easing: 'linear' } },
  { id: 'tilt_up', name: 'Tilt Up', hfName: 'Tilt Up', group: 'Pan', description: 'Reveals upward.', css: { from: 'translateY(6%) scale(1.15)', to: 'translateY(-6%) scale(1.15)', easing: 'ease-in-out' } },
  { id: 'handheld', name: 'Handheld', hfName: 'Handheld', group: 'Character', description: 'Organic, documentary shake.', css: { from: 'translate(0,0) rotate(0) scale(1.08)', to: 'translate(1.5%,-1%) rotate(.6deg) scale(1.1)', easing: 'ease-in-out', alternate: true, duration: 0.5 } },
  { id: 'snorricam', name: 'Snorricam', hfName: 'Snorricam', group: 'Character', description: 'Camera locked to the body, world swings.', css: { from: 'rotate(-5deg) scale(1.25)', to: 'rotate(5deg) scale(1.25)', easing: 'ease-in-out', alternate: true, duration: 1.2 } },
  { id: 'dutch_angle', name: 'Dutch Angle', hfName: 'Dutch Angle', group: 'Character', description: 'Tilts the horizon for unease.', css: { from: 'rotate(0) scale(1.1)', to: 'rotate(9deg) scale(1.25)', easing: 'ease-in-out' } },
  { id: 'low_angle_push', name: 'Low Angle Push', hfName: 'Low Angle', group: 'Character', description: 'Heroic push-in from below.', css: { from: 'perspective(600px) rotateX(8deg) scale(1)', to: 'perspective(600px) rotateX(2deg) scale(1.3)', easing: 'ease-in' } },
  { id: 'static', name: 'Static', hfName: 'Static', group: 'Basic', description: 'Locked-off camera, only the scene moves.', css: { from: 'scale(1.02)', to: 'scale(1.04)', easing: 'ease-in-out' } },
];

const STYLES = [
  { id: 'none', name: 'No style', suffix: '' },
  { id: 'cinematic', name: 'Cinematic', suffix: 'cinematic film still, anamorphic lens, volumetric light, 35mm, shallow depth of field' },
  { id: 'noir', name: 'Film Noir', suffix: 'black and white film noir, hard shadows, venetian blind light, 1940s' },
  { id: 'anime', name: 'Anime', suffix: 'anime key visual, clean linework, cel shading, vibrant' },
  { id: 'y2k', name: 'Y2K', suffix: 'y2k aesthetic, glossy chrome, flash photography, early 2000s magazine' },
  { id: 'polaroid', name: 'Polaroid', suffix: 'instant polaroid photo, soft grain, warm faded colors' },
  { id: 'editorial', name: 'Editorial', suffix: 'high fashion editorial, studio strobe, Vogue cover, sharp' },
  { id: 'cyberpunk', name: 'Cyberpunk', suffix: 'cyberpunk city, neon rain, holograms, teal and magenta' },
  { id: 'vintage', name: 'Vintage Film', suffix: 'kodak portra 400, 1970s, halation, soft contrast' },
];

const ASPECT_RATIOS = [
  { id: '9:16', name: 'Portrait', w: 9, h: 16, size: '1536x2048' },
  { id: '1:1', name: 'Square', w: 1, h: 1, size: '2048x2048' },
  { id: '4:3', name: 'Classic', w: 4, h: 3, size: '2048x1536' },
  { id: '16:9', name: 'Wide', w: 16, h: 9, size: '2048x1152' },
  { id: '3:4', name: 'Tall', w: 3, h: 4, size: '1536x2048' },
];

const VIDEO_MODELS = [
  { id: 'dop-lite', name: 'Lite', description: 'Fastest, lower cost.' },
  { id: 'dop-standard', name: 'Standard', description: 'Balanced quality and speed.' },
  { id: 'dop-turbo', name: 'Turbo', description: 'Highest fidelity motion.' },
];

const DURATIONS = [3, 5];

function findMotion(id) {
  return MOTIONS.find((m) => m.id === id) || null;
}

function findStyle(id) {
  return STYLES.find((s) => s.id === id) || STYLES[0];
}

function findAspect(id) {
  return ASPECT_RATIOS.find((a) => a.id === id) || ASPECT_RATIOS[0];
}

module.exports = { MOTIONS, STYLES, ASPECT_RATIOS, VIDEO_MODELS, DURATIONS, findMotion, findStyle, findAspect };
