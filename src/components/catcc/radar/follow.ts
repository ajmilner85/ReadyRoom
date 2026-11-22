/**
 * Radar scope Follow (toolbar button, or a double-click on a contact): while on, the view centre is the
 * hooked contact's position, at the current range. It follows whichever contact is hooked, so hooking
 * another one moves to it. It stops, leaving the view where it last was, when nothing is hooked any more
 * or the hooked contact has left the picture. Scope also stops it on a pan, a second press of the
 * button, a double-click on empty map (which centres the view there), a range preset, Centre on carrier
 * and a go-to.
 */
export type Pt = [number, number];

export type FollowStep = { kind: 'off' } | { kind: 'follow'; id: string; p: Pt } | { kind: 'stop' };

export function followStep(on: boolean, hookedId: string | null, air: readonly { id: string; p: Pt }[]): FollowStep {
  if (!on) return { kind: 'off' };
  const t = hookedId ? air.find((a) => a.id === hookedId) : undefined;
  return t ? { kind: 'follow', id: t.id, p: t.p } : { kind: 'stop' };
}

/** the Follow button can be turned on only while a contact in the picture is hooked (it can always be turned off) */
export const canFollow = (hookedId: string | null, air: readonly { id: string }[]) => !!hookedId && air.some((a) => a.id === hookedId);

/**
 * The view centre after a zoom from width w to nw. Held (carrier lock or Follow): the centre stays put,
 * so the carrier / the followed contact stays centred at the new range and Follow stays on. Otherwise
 * the point under the cursor (about) stays under it.
 */
export function zoomCentre(c: Pt, w: number, nw: number, about: Pt | undefined, held: boolean): Pt {
  const a = held || !about ? c : about;
  return [a[0] + ((c[0] - a[0]) * nw) / w, a[1] + ((c[1] - a[1]) * nw) / w];
}

export type DblAction = { kind: 'none' } | { kind: 'follow'; id: string } | { kind: 'centre'; p: Pt };

/**
 * A double-click on the scope. Only with the Select tool and nothing being placed: the other tools and
 * placements keep their own clicks (a marshal / vector / intercept click commits, BRA / CPA / waypoint
 * clicks set points), so a double-click there is just their two clicks. On a contact: hook it and follow
 * it. On empty map: stop following and centre the view on that point.
 */
export function dblClickAction(tool: string, placing: boolean, trackId: string | undefined, q: Pt): DblAction {
  if (tool !== 'select' || placing) return { kind: 'none' };
  return trackId ? { kind: 'follow', id: trackId } : { kind: 'centre', p: q };
}
