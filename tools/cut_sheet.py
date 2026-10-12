"""Cut an artist sprite sheet into game cells WITHOUT altering the art.

The character pixels are copied 1:1 (no resampling, no palette change). Only the background
is made transparent (a baked-in checkerboard / flat light background), then each pose is
placed in a uniform cell: same ground line per row, same horizontal anchor per column.

writes <out>.png + <out>.json ({ cell, anchor, anims: { name: { row, frames } } })
usage: python3 tools/cut_sheet.py SHEET OUT_BASENAME
"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ANIMS = ['idle', 'walk', 'run', 'punch', 'kick', 'jump', 'jumpkick']

def background_mask(rgb):
    mx, mn = rgb.max(2).astype(int), rgb.min(2).astype(int)
    # checkerboard tones are light and grey; keep only big connected areas so small light details
    # inside the character (eye whites, shoe highlights) stay
    cand = (mn >= 218) & (mx - mn <= 12)
    lab, n = ndimage.label(cand)
    sizes = ndimage.sum(cand, lab, range(1, n + 1))
    bg = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 14])
    # compression halo: light grey pixels touching the background
    halo = (mn >= 165) & (mx - mn <= 26)
    for _ in range(3):
        bg |= halo & ndimage.binary_dilation(bg)
    return bg

def defringe(rgb, solid, passes=3):
    """Drop the light halo left by the old background around the silhouette.
    Only removes edge pixels (never recolours): an edge pixel goes if it is light and clearly
    lighter than the solid pixels just inside it, so light-grey parts (shoe soles) stay."""
    lum = rgb.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    sat = rgb.max(2).astype(int) - rgb.min(2).astype(int)
    k = np.ones((3, 3), np.float32)
    for _ in range(passes):
        edge = solid & ndimage.binary_dilation(~solid)
        inner = solid & ~edge
        n = ndimage.convolve(inner.astype(np.float32), k, mode='constant')
        inner_lum = ndimage.convolve(np.where(inner, lum, 0), k, mode='constant') / np.maximum(n, 1)
        halo = edge & (lum > 120) & (sat < 70) & ((n == 0) | (lum - inner_lum > 35))
        if not halo.any():
            break
        solid = solid & ~halo
    return solid

def main(src, out):
    rgb = np.array(Image.open(src).convert('RGB'))
    solid = defringe(rgb, ~background_mask(rgb))
    lab, _ = ndimage.label(ndimage.binary_dilation(solid, iterations=2))
    poses = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        mask = (lab[sl] == i + 1) & solid[sl]
        if mask.sum() >= 800:
            poses.append((sl, mask))
    poses.sort(key=lambda p: (p[0][0].start + p[0][0].stop) / 2)
    rows, cur = [], [poses[0]]
    for p in poses[1:]:
        yc = (p[0][0].start + p[0][0].stop) / 2
        if abs(yc - np.mean([(c[0][0].start + c[0][0].stop) / 2 for c in cur])) > 60:
            rows.append(cur); cur = [p]
        else:
            cur.append(p)
    rows.append(cur)
    rows = [sorted(r, key=lambda p: p[0][1].start) for r in rows]
    ncol = max(len(r) for r in rows)
    colc = [np.mean([(r[c][0][1].start + r[c][0][1].stop) / 2 for r in rows if len(r) > c]) for c in range(ncol)]

    # cell size: big enough for the widest/tallest pose around the anchor
    left = right = up = 0
    for r in rows:
        ground = max(p[0][0].stop for p in (r[0], r[-1]))
        for ci, (sl, _) in enumerate(r):
            left = max(left, colc[ci] - sl[1].start); right = max(right, sl[1].stop - colc[ci])
            up = max(up, ground - sl[0].start)
    AX = int(np.ceil(max(left, right))) + 2
    CW, CH = AX * 2, int(np.ceil(up)) + 4
    AY = CH - 2
    sheet = np.zeros((len(rows) * CH, ncol * CW, 4), np.uint8)
    for ri, r in enumerate(rows):
        ground = max(p[0][0].stop for p in (r[0], r[-1]))  # first/last poses stand on the ground
        for ci, (sl, mask) in enumerate(r):
            ys, xs = sl
            x0 = ci * CW + int(round(AX - colc[ci])) + xs.start
            y0 = ri * CH + AY - ground + ys.start
            dst = sheet[y0:y0 + mask.shape[0], x0:x0 + mask.shape[1]]
            dst[mask, :3] = rgb[ys, xs][mask]
            dst[mask, 3] = 255
    Image.fromarray(sheet, 'RGBA').save(out + '.png')
    meta = {'cell': [CW, CH], 'anchor': [AX, AY],
            'anims': {ANIMS[i] if i < len(ANIMS) else f'row{i}': {'row': i, 'frames': len(r)} for i, r in enumerate(rows)}}
    json.dump(meta, open(out + '.json', 'w'), indent=2)
    print('wrote', out, 'cell', CW, CH, 'rows', [len(r) for r in rows])

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
