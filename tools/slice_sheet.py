"""Slice an artist sprite sheet (transparent PNG/WebP, one character pose per grid cell) into
game-ready pixel-art frames.

- each pose is found as an isolated silhouette (robust to irregular grids)
- frames are anchored on the ground line of their row and on the cell column centre
- downscaled to the art's native pixel size, alpha-thresholded and quantized to one shared
  palette so the result is crisp pixel art
- writes <out>.png (uniform cells, one row per animation) and <out>.json (cell size, anchor, anims)

usage: python3 tools/slice_sheet.py SHEET OUT_BASENAME [--scale 0.5]
"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ANIMS = ['idle', 'walk', 'run', 'punch', 'kick', 'jump', 'jumpkick']

def main(src, out, scale=0.5, colors=48):
    im = np.array(Image.open(src).convert('RGBA'))
    solid = im[:, :, 3] > 128
    lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=3))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        mask = (lab[sl] == i + 1) & solid[sl]
        if mask.sum() < 400:
            continue
        boxes.append((sl, mask))
    # group into rows by vertical centre, then sort by x
    boxes.sort(key=lambda b: (b[0][0].start + b[0][0].stop) / 2)
    rows, cur = [], [boxes[0]]
    for b in boxes[1:]:
        yc = (b[0][0].start + b[0][0].stop) / 2
        pyc = np.mean([(c[0][0].start + c[0][0].stop) / 2 for c in cur])
        if abs(yc - pyc) > 45:
            rows.append(cur); cur = [b]
        else:
            cur.append(b)
    rows.append(cur)
    rows = [sorted(r, key=lambda b: b[0][1].start) for r in rows]
    # column centres shared by all rows
    ncol = max(len(r) for r in rows)
    colc = [np.mean([(r[c][0][1].start + r[c][0][1].stop) / 2 for r in rows if len(r) > c]) for c in range(ncol)]

    CELL = 128  # full-res cell, becomes CELL*scale in game
    AX, AY = CELL // 2, CELL - 8
    # rows drawn at a different size are normalised on the first row's first pose (standing height)
    height = lambda b: b[0][0].stop - b[0][0].start
    ref_h = height(rows[0][0])
    frames = []
    for ri, r in enumerate(rows):
        ground = max(b[0][0].stop for b in r[:1] + r[-1:])  # first/last poses stand on the ground
        k = ref_h / height(r[0])
        if abs(k - 1) < 0.04:
            k = 1.0
        for ci, (sl, mask) in enumerate(r):
            ys, xs = sl
            piece = im[ys, xs].copy()
            piece[~mask] = 0
            # position of the piece relative to the anchor (column centre, ground line), scaled by k
            ox = (xs.start - colc[ci]) * k + AX
            oy = (ys.start - ground) * k + AY
            if k != 1.0:
                pw, ph = max(1, round(piece.shape[1] * k)), max(1, round(piece.shape[0] * k))
                piece = np.array(Image.fromarray(piece, 'RGBA').resize((pw, ph), Image.LANCZOS))
                piece[piece[:, :, 3] < 128] = 0
            cell = Image.new('RGBA', (CELL, CELL))
            cell.alpha_composite(Image.fromarray(piece, 'RGBA'), (int(round(ox)), int(round(oy))))
            frames.append((ri, ci, np.array(cell)))

    # downscale on premultiplied colour, threshold alpha
    S = int(CELL * scale)
    small = []
    for ri, ci, cell in frames:
        f = cell.astype(np.float32) / 255
        pm = np.dstack([f[:, :, :3] * f[:, :, 3:4], f[:, :, 3:4]])
        img = Image.fromarray((pm * 255).astype(np.uint8), 'RGBA').resize((S, S), Image.BOX)
        a = np.array(img).astype(np.float32) / 255
        alpha = a[:, :, 3:4]
        rgb = np.where(alpha > 0, a[:, :, :3] / np.maximum(alpha, 1e-6), 0)
        keep = alpha[:, :, 0] >= 0.5
        small.append((ri, ci, rgb, keep))
    # one shared palette for every frame
    allpx = np.concatenate([rgb[keep] for _, _, rgb, keep in small])
    pal_img = Image.fromarray((allpx[None] * 255).astype(np.uint8), 'RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    nrow = len(rows)
    sheet = np.zeros((nrow * S, ncol * S, 4), np.uint8)
    for ri, ci, rgb, keep in small:
        q = Image.fromarray((rgb * 255).astype(np.uint8), 'RGB').quantize(palette=pal_img, dither=Image.Dither.NONE).convert('RGB')
        q = np.array(q)
        cell = np.zeros((S, S, 4), np.uint8)
        cell[keep, :3] = q[keep]; cell[keep, 3] = 255
        sheet[ri * S:(ri + 1) * S, ci * S:(ci + 1) * S] = cell
    Image.fromarray(sheet, 'RGBA').save(out + '.png')
    meta = {
        'cell': [S, S], 'anchor': [AX * scale, AY * scale],
        'anims': {ANIMS[ri] if ri < len(ANIMS) else f'row{ri}': {'row': ri, 'frames': len(r)} for ri, r in enumerate(rows)},
    }
    json.dump(meta, open(out + '.json', 'w'), indent=2)
    print('wrote', out + '.png', sheet.shape, 'rows', [len(r) for r in rows])

if __name__ == '__main__':
    a = sys.argv[1:]
    sc = float(a[a.index('--scale') + 1]) if '--scale' in a else 0.5
    main(a[0], a[1], sc)
