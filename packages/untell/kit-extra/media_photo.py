"""Prepares a photo for untell: the cut-out (the model, or the photo's own alpha) and the graded plates.

Usage: python media_photo.py <media folder> <system id> cut|nocut|alpha <source file name> [--keep-holes]

The source is the file that `untell media add` stored (source.jpg, source.png or source.webp). A photo with an
EXIF orientation (a phone photo) is turned upright first.
  cut    A source with its own transparency (a cut-out) keeps its alpha: no model runs. Its alpha becomes
         cutout.png and the source is flattened onto the system's ground into source.jpg. Any other source
         is cut out with media_cut.py (rembg, BiRefNet). Its clean() then opens the backdrop gaps that the
         subject encloses and removes the backdrop rim; --keep-holes keeps every gap filled. Then
         media_treat.py grades both layers.
  nocut  The plates (plate.jpg, plate-top.jpg, plate-dim.jpg) and the ink separations (ink-<role>.png, Riso). No
         subject.png and no paper.png (a paper cut is a cut-out). meta.json has the whole
         photo as the subject box and no mask, so the `photo` block cannot use `over` with it. A source with
         its own transparency is flattened onto the system's ground first, never onto black.
  alpha  Prints "alpha" when the source has its own transparency (so `cut` needs no model), else "opaque".

A plate is a JPEG, so it cannot stay transparent: a transparent pixel takes the system's ground (white with --as-is,
which has no ground). Dropping the alpha instead shows the colour stored under it, often black.

Grades come from media_treat.py, beside this file.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import media_treat  # noqa: E402
from media_treat import dim_of, fade_top_array, grade_array, ground_of, levels_of, to_image  # noqa: E402


SOURCE = "source.jpg"
KEEP_HOLES = False


def source_of(d):
    p = d / SOURCE
    if not p.exists():
        raise SystemExit(f"no source image {p}")
    return p


def upright(path):
    """The image, turned by its EXIF orientation. A turned JPEG source is saved upright, so the grade sees it so."""
    im = Image.open(path)
    turned = ImageOps.exif_transpose(im)
    if turned is not im and path.suffix.lower() == ".jpg":
        turned.convert("RGB").save(path, quality=95)
    return turned


def back_of(system):
    """The colour a transparent pixel takes on a plate: the system's ground, or white with --as-is (no ground)."""
    ground = ground_of(system)
    return tuple(int(round(v * 255)) for v in ground) if ground is not None else (255, 255, 255)


def flat(im, system):
    """The image as RGB; a transparent pixel takes back_of(system), never the colour stored under it."""
    if not has_alpha(im):
        return im.convert("RGB")
    src = im.convert("RGBA")
    out = Image.new("RGB", src.size, back_of(system))
    out.paste(src, mask=src.getchannel("A"))
    return out


def nocut(d, system):
    src = flat(upright(source_of(d)), system)
    a = np.asarray(src, dtype=np.float32) / 255.0
    levels = levels_of(a)
    plate = grade_array(a, system, levels)
    to_image(plate).save(d / "plate.jpg", quality=94)
    ground = ground_of(system)
    if ground is not None:
        to_image(fade_top_array(plate, ground)).save(d / "plate-top.jpg", quality=94)
    if dim_of(system):
        to_image(grade_array(a, system, levels, dim=dim_of(system))).save(d / "plate-dim.jpg", quality=94)
    # The ink separations (Riso's halftone inks) read the whole photo, not a cut-out: they are written here too.
    # Only the paper cut (Cutout's paper.png) is a cut-out: it needs the subject's edge, so it needs the cut-out.
    inks = media_treat.ink_layers(d, a, system, levels) if system != "none" else []
    if inks:
        print(f"  ink layers: {', '.join(f'ink-{r}.png' for r in inks)}")
    if system != "none" and ((media_treat.tokens_of(system) or {}).get("media", {}).get("grade", {}).get("kind") == "posterize"):
        print(f"  note: {system} cuts the subject from paper (paper.png): that needs a cut-out. Prepare it without --no-cutout for photo({{ paper: true }}).")
    W, H = src.size
    meta = {"kind": "photo", "width": W, "height": H, "subject": [0, 0, 1, 1], "centre": [0.5, 0.5], "grade": system,
            "coverage": 0, "mask": None}
    (d / "meta.json").write_text(json.dumps(meta, indent=1))
    print(f"prepared {d.name} for {system} with no cut-out: {W}x{H}")


def has_alpha(im):
    if im.mode not in ("RGBA", "LA", "PA") and not (im.mode == "P" and "transparency" in im.info):
        return False
    return int(np.asarray(im.convert("RGBA").getchannel("A")).min()) < 250


def cut(d, system):
    path = source_of(d)
    im = upright(path)
    if has_alpha(im):
        alpha(d, system, im)
        return
    if path.name != "source.jpg":
        im.convert("RGB").save(d / "source.jpg", quality=95)
    here = Path(__file__).resolve().parent
    subprocess.run([sys.executable, str(here / "media_cut.py"), str(d / "source.jpg"), str(d / "cutout.png"), *(["--keep-holes"] if KEEP_HOLES else [])], check=True)
    sys.argv = [sys.argv[0], str(d), system]
    media_treat.main()


def alpha(d, system, im):
    src = im.convert("RGBA")
    src.save(d / "cutout.png")
    print("kept the photo's own transparency as the cut-out")
    flat(src, system).save(d / "source.jpg", quality=95)
    sys.argv = [sys.argv[0], str(d), system]
    media_treat.main()


if __name__ == "__main__":
    KEEP_HOLES = "--keep-holes" in sys.argv
    argv = [x for x in sys.argv if x != "--keep-holes"]
    folder, sid, mode = Path(argv[1]), argv[2], argv[3]
    SOURCE = argv[4] if len(argv) > 4 else SOURCE
    if mode == "alpha":
        print("alpha" if has_alpha(upright(source_of(folder))) else "opaque")
    else:
        {"nocut": nocut, "cut": cut}[mode](folder, sid)
