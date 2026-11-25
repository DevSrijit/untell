"""Cuts: one function for the detector (sound_common.cuts, the beat and ending checks) and the review sheet
(scripts/review_sheet.py), so both count the same shot changes.

cut_frames(grey) takes every frame as a small grey copy (n, h, w) and returns the frames that start a new shot:
  whole frame   over WHOLE of the frame changes by over DELTA grey levels in one frame, and that change is a spike:
                over SPIKE times the median change of the frames round it (a slide or a wipe spreads its change).
  subject       a shot change of a subject on one ground (a 3D object on a dark plate) leaves most pixels as they
                are, so the frame is also read by region: of the pixels off the ground on the frame before or on this
                frame (at least MIN_SUBJECT of the frame), over SUBJECT of them are off the ground on one frame and not on
                the other (the silhouette moves; a colour change in place is not a cut), and that share is a spike too.
                A region cut is also done in one frame, and is large: the pixels that change on the frame before
                and the frame after are under ISOLATE of its own (a frame that repeats the one before, as in an animation on twos,
                is skipped once), and the pixels that change are MIN_AREA of the frame or more (MIN_SWAP for a swap: SWAP_SHARE or more of the
                change leaves and SWAP_SHARE or more comes in, as a word replaced by the next). So a slide, a wipe, a
                scale-up, an entrance that grows, or UI text that fades out (each judged on the reels' frames: none
                is a shot change) is not a cut; a picture that cuts out is.
A whole-frame cut is done in one frame too: the frame before and the frame after change under WHOLE_ISOLATE of it
(a burst that scales up over the frame is not a cut).
A run of cut frames within 2 frames of each other (a whip pan) is one cut, on its last frame.
The ground is the most common grey level of the film (bins of 4).
"""
import numpy as np

DELTA = 24
WHOLE, SUBJECT, SPIKE, MIN_SUBJECT = 0.30, 0.55, 3.0, 0.01
GROUND_DELTA = 16
ISOLATE, MIN_AREA = 0.45, 0.04
WHOLE_ISOLATE = 0.6
MIN_SWAP, SWAP_SHARE = 0.015, 0.3


def film_ground(grey):
    """The ground: the most common grey level of the film (bins of 4), read on every (n // 60)th frame."""
    n = len(grey)
    vals, counts = np.unique((np.asarray(grey[:: max(1, n // 60)], dtype=np.int16) // 4).ravel(), return_counts=True)
    return int(vals[counts.argmax()]) * 4 + 2


def cut_frames(grey, ground=None):
    """`ground`: the film's ground (film_ground), for a caller that reads a long film in parts."""
    g = np.asarray(grey, dtype=np.int16)
    n = len(g)
    if n < 3:
        return []
    if ground is None:
        ground = film_ground(g)
    off = np.abs(g - ground) > GROUND_DELTA
    whole = np.zeros(n)
    region = np.zeros(n)
    d = np.abs(g[1:] - g[:-1]) > DELTA
    whole[1:] = d.reshape(n - 1, -1).mean(axis=1)
    union = off[1:] | off[:-1]
    us = union.reshape(n - 1, -1).sum(axis=1)
    # The silhouette moves: pixels off the ground on one frame and not on the other (a colour change in place, such as
    # bars that turn grey, keeps its silhouette and is not a cut).
    ch = ((off[1:] ^ off[:-1]) & d).reshape(n - 1, -1).sum(axis=1)
    share = union.reshape(n - 1, -1).mean(axis=1)
    region[1:] = np.where((us > 0) & (share >= MIN_SUBJECT), ch / np.maximum(us, 1), 0)
    area = np.zeros(n)
    area[1:] = ch / max(1, g[0].size)
    # A swap: something leaves and something new takes its place on the same frame (a word replaced by the next).
    came = ((off[1:] & ~off[:-1]) & d).reshape(n - 1, -1).sum(axis=1)
    swap = np.zeros(n, dtype=bool)
    swap[1:] = (came >= SWAP_SHARE * ch) & (ch - came >= SWAP_SHARE * ch)
    held = whole <= 0  # a frame that repeats the one before

    def beside(i, step, of=None):
        """The share (region, or `of`: whole, area) of the next changing frame on one side of i (a held frame is skipped once)."""
        v = region if of is None else of
        j = i + step
        if 0 < j < n and held[j] and region[j] == 0:
            j += step
        return v[j] if 0 < j < n else 0.0
    out = []
    for i in range(1, n):
        lo, hi = max(1, i - 6), min(n, i + 7)
        mw = float(np.median(np.r_[whole[lo:i], whole[i + 1:hi]])) if hi - lo > 1 else 0.0
        mr = float(np.median(np.r_[region[lo:i], region[i + 1:hi]])) if hi - lo > 1 else 0.0
        by_region = (region[i] > SUBJECT and region[i] > SPIKE * max(0.02, mr) and (area[i] >= MIN_AREA or (swap[i] and area[i] >= MIN_SWAP))
                     and max(beside(i, -1, area), beside(i, 1, area)) < ISOLATE * area[i])
        by_whole = (whole[i] > WHOLE and whole[i] > SPIKE * max(1e-3, mw)
                    and max(whole[i - 1], whole[i + 1] if i + 1 < n else 0.0) < WHOLE_ISOLATE * whole[i])
        if by_whole or by_region:
            out.append(i)
    # A run of cut frames (a whip pan: every frame of it changes) is one cut, where the run lands.
    merged = []
    for i in out:
        if merged and i - merged[-1] <= 2:
            merged[-1] = i
        else:
            merged.append(i)
    return merged
