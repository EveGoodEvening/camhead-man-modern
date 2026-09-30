// src/chars/npcs/behaviour.ts — owner C. Per-character idles (sim time only) and extra poses.
import type { NpcId, Phase, SpotId } from '../../types';
import type { PoseDef } from '../anim';

/** Extra named poses per NPC (absolute bone rotations, degrees). */
export const NPC_POSES: Partial<Record<NpcId, Readonly<Record<string, PoseDef>>>> = {
  xiaolin: {
    eat: { rot: { armR: [-62, 0, -12], foreR: [-118, 0, 0] } },
    cupHold: { rot: { armR: [-18, 0, -10], foreR: [-70, 0, 0] } },
  },
  granny_wang: {
    cart: { rot: { armR: [-12, 0, -22], foreR: [-25, 0, 0] } },
  },
  old_chen: {
    mend: { rot: { armL: [-16, 0, 10], armR: [-16, 0, -10], foreL: [-62, -38, 0], foreR: [-62, 38, 0], head: [18, 0, 0] } },
    behind: { rot: { armL: [18, 0, 10], armR: [18, 0, -10], foreL: [-60, 30, 0], foreR: [-60, -30, 0] } },
  },
  xiaoliu: {
    board: { rot: { armL: [-14, 0, 6], foreL: [-88, -30, 0], handL: [60, 0, 0] } },
    horn: { rot: { armR: [-100, 0, -8], foreR: [-80, 0, 0] } },
    perch: {
      rot: { legL: [-86, 0, 6], legR: [-80, 0, -6], shinL: [80, 0, 0], shinR: [70, 0, 0], spine: [8, 0, 0], armR: [-14, 0, -18], foreR: [-30, 0, 0] },
      hips: [0, -0.78, -0.05],
    },
  },
  tudi: {
    puff: { rot: { armR: [-70, 0, -18], foreR: [-110, 0, 0] } },
  },
  attendant: {
    drive: { rot: { armL: [-60, 0, 6], armR: [-60, 0, -6], foreL: [-30, 0, 0], foreR: [-30, 0, 0] } },
  },
};

export interface IdleCtx { t: number; phase: Phase; at: SpotId | null; talking: boolean; /** bus parked: in the doorway */ atDoor?: boolean }
export interface IdleOut { poses: Map<string, number>; lookPitch: number; lookYaw: number; talk: number; props: Map<string, boolean> }

function pulse(t: number, period: number, dur: number, offset = 0): number {
  const k = ((t + offset) % period) / dur;
  return k < 1 ? Math.sin(k * Math.PI) : 0;
}

/** Fill `out` for one tick. Pose weights not written stay at their previous value (set them all). */
export function idle(id: NpcId, c: IdleCtx, out: IdleOut): void {
  const p = out.poses;
  out.lookPitch = 0; out.lookYaw = 0; out.talk = c.talking ? 1 : 0;
  switch (id) {
    case 'xiaolin': {
      const night = c.phase === 'night';
      out.props.set('cup', night);
      p.set('cupHold', night ? 1 - pulse(c.t, 7, 1.6) : 0);
      p.set('eat', night ? pulse(c.t, 7, 1.6) : 0);
      if (!night && !c.talking) out.lookPitch = 0.05 * Math.sin(c.t * Math.PI * 2 * 1.6);   // nodding to the headphones
      break;
    }
    case 'granny_wang': {
      const window = c.at === 'sp_estate_window', dawn = c.phase === 'dawn';
      p.set('hold', window || dawn ? 1 : 0);
      p.set('cart', !window && !dawn ? 1 : 0);
      out.props.set('frame', window);
      out.props.set('cart', !window && !dawn);
      out.lookPitch = window ? -0.35 : 0;
      break;
    }
    case 'old_chen': {
      const day = c.phase === 'day';
      p.set('mend', day && !c.talking ? 1 : 0);
      p.set('behind', !day && c.phase !== 'dawn' && !c.talking ? 1 : 0);
      if (day) out.lookYaw = 0.15 * Math.sin(c.t * 0.7);
      break;
    }
    case 'xiaoliu': {
      const night = c.phase === 'night';
      p.set('perch', night ? 1 : 0);
      p.set('board', !night ? 1 : 0);
      out.props.set('board', !night);
      p.set('horn', !night && !c.talking ? pulse(c.t, 9, 2.2, 3) : 0);
      break;
    }
    case 'tudi': {
      p.set('crouch', c.phase === 'night' || c.phase === 'dawn' ? 1 : 0);
      p.set('puff', pulse(c.t, 5, 1.4));
      break;
    }
    case 'attendant': {
      const seated = c.at === 'sp_bus_door' && !c.atDoor;
      p.set('drive', seated ? 1 : 0);
      p.set('sit', seated ? 1 : 0);
      break;
    }
    default:
  }
}
