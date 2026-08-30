"""Generated dinosaur art -> lightweight production WebP assets.

Sources stay under work/art-src/generated-20260830 (ignored by Git).
Bone parts become 512px transparent squares; full skeletons keep their
natural wide aspect ratio.  Restoration art becomes a 768x512 card image.
"""

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "work" / "art-src" / "generated-20260830"
BONES = ROOT / "app" / "assets" / "bones"
DINOSAURS = ROOT / "app" / "assets" / "dinosaurs"

PARTS = [
    "biped_body",
    "biped_fore",
    "biped_hind",
    "biped_tail",
    "head_stegosaurus",
    "head_brachiosaurus",
    "head_tyrannosaurus",
]
FULL = ["full_brachiosaurus", "full_tyrannosaurus"]


def visible_bbox(image: Image.Image):
    alpha = image.getchannel("A")
    return alpha.point(lambda value: 255 if value > 8 else 0).getbbox()


def contain_transparent(source: Path, output: Path, *, width: int, square: bool):
    image = Image.open(source).convert("RGBA")
    bbox = visible_bbox(image)
    if not bbox:
        raise ValueError(f"No visible pixels: {source}")
    image = image.crop(bbox)

    margin = 0.07
    if square:
        canvas_size = (width, width)
    else:
        ratio = image.height / image.width
        canvas_size = (width, max(1, round(width * ratio)))

    inner_w = round(canvas_size[0] * (1 - margin * 2))
    inner_h = round(canvas_size[1] * (1 - margin * 2))
    scale = min(inner_w / image.width, inner_h / image.height)
    drawn = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    canvas.alpha_composite(
        drawn,
        ((canvas.width - drawn.width) // 2, (canvas.height - drawn.height) // 2),
    )
    canvas.save(output, "WEBP", lossless=False, quality=84, method=6, exact=True)
    print(f"{output.relative_to(ROOT)}  {canvas.width}x{canvas.height}  {output.stat().st_size:,} bytes")


def restoration(source: Path, output: Path):
    image = Image.open(source).convert("RGB")
    target_ratio = 3 / 2
    current_ratio = image.width / image.height
    if current_ratio > target_ratio:
        new_width = round(image.height * target_ratio)
        left = (image.width - new_width) // 2
        image = image.crop((left, 0, left + new_width, image.height))
    elif current_ratio < target_ratio:
        new_height = round(image.width / target_ratio)
        top = (image.height - new_height) // 2
        image = image.crop((0, top, image.width, top + new_height))
    image = image.resize((768, 512), Image.Resampling.LANCZOS)
    image.save(output, "WEBP", quality=82, method=6)
    print(f"{output.relative_to(ROOT)}  768x512  {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    BONES.mkdir(parents=True, exist_ok=True)
    DINOSAURS.mkdir(parents=True, exist_ok=True)
    for name in PARTS:
        contain_transparent(SOURCE / f"{name}.png", BONES / f"{name}.webp", width=512, square=True)
    for name in FULL:
        contain_transparent(SOURCE / f"{name}.png", BONES / f"{name}.webp", width=512, square=False)
    restoration(
        SOURCE / "tyrannosaurus_restoration.png",
        DINOSAURS / "tyrannosaurus_restoration.webp",
    )
