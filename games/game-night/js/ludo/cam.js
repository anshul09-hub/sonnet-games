// Camera framing for Ludo: fit the board (and the dice tray) into the view whatever the aspect ratio.
import * as THREE from 'three';

const _cam = new THREE.PerspectiveCamera();
const _v = new THREE.Vector3();

/**
 * Find the camera position looking at a target from direction `dir` (unit vector from target to camera) so that all
 * `points` project inside the given NDC margins. Returns {pos, look}.
 */
export function fitCamera(points, { fov = 36, aspect = 1.6, pitch = 58, yaw = 0, margins = { l: 0.05, r: 0.05, t: 0.16, b: 0.06 }, center = null } = {}) {
  _cam.fov = fov; _cam.aspect = aspect; _cam.near = 0.5; _cam.far = 500; _cam.updateProjectionMatrix();
  const p = THREE.MathUtils.degToRad(pitch), y = yaw;
  const dir = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
  const box = new THREE.Box3().setFromPoints(points);
  const target = center ? center.clone() : box.getCenter(new THREE.Vector3());
  const inside = (d, tgt) => {
    _cam.position.copy(tgt).addScaledVector(dir, d); _cam.lookAt(tgt); _cam.updateMatrixWorld(true);
    for (const pt of points) {
      _v.copy(pt).project(_cam);
      if (_v.x < -1 + margins.l * 2 || _v.x > 1 - margins.r * 2 || _v.y < -1 + margins.b * 2 || _v.y > 1 - margins.t * 2 || _v.z > 1) return false;
    }
    return true;
  };
  let lo = 8, hi = 200;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (inside(mid, target)) hi = mid; else lo = mid; }
  let d = hi;
  // re-centre: shift the target so the projected bounds sit centred inside the margins
  _cam.position.copy(target).addScaledVector(dir, d); _cam.lookAt(target); _cam.updateMatrixWorld(true);
  let minX = 9, maxX = -9, minY = 9, maxY = -9;
  for (const pt of points) { _v.copy(pt).project(_cam); minX = Math.min(minX, _v.x); maxX = Math.max(maxX, _v.x); minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y); }
  const cx = (minX + maxX) / 2 - (margins.l - margins.r), cy = (minY + maxY) / 2 - (margins.b - margins.t);
  const halfH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * d, halfW = halfH * aspect;
  const right = new THREE.Vector3().setFromMatrixColumn(_cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(_cam.matrixWorld, 1);
  const shifted = target.clone().addScaledVector(right, cx * halfW * 0.98).addScaledVector(up, cy * halfH * 0.98);
  let d2 = d; for (let i = 0; i < 12 && !inside(d2, shifted); i++) d2 *= 1.03;
  return { pos: shifted.clone().addScaledVector(dir, d2), look: shifted };
}
