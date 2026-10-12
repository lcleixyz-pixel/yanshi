#!/usr/bin/env python3
"""Assemble the six review renders without altering their source pixels/files."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RENDERS = ROOT / "renders"
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
LABELS = [
    ("front", "前向 · 模型 −Y"),
    ("back", "后向 · 模型 +Y"),
    ("left", "左向 · 模型 −X"),
    ("right", "右向 · 模型 +X"),
    ("top", "俯视 · 模型 +Z"),
    ("hero", "3/4 视图 · +38° / 20°"),
]
canvas = Image.new("RGB", (1584, 1200), (241, 241, 239))
draw = ImageDraw.Draw(canvas)
title_font = ImageFont.truetype(FONT, 29)
label_font = ImageFont.truetype(FONT, 23)
note_font = ImageFont.truetype(FONT, 20)
draw.text((24, 18), "Tripo A 候选 · 原始 GLB 六视图", fill=(31, 36, 39), font=title_font)
draw.text((24, 58), "模型坐标方位，尚未验证实物方向。保留原始几何、材质与贴图；未修补通光区域。", fill=(70, 75, 80), font=note_font)
stats = {}
for i, (name, label) in enumerate(LABELS):
    source = RENDERS / (name + ".png")
    image = Image.open(source).convert("RGB")
    stats[name] = {"size": list(image.size), "channelExtrema": [list(pair) for pair in image.getextrema()]}
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    x, y = 16 + (i % 3) * 528, 101 + (i // 3) * 548
    canvas.paste(image, (x, y))
    draw.text((x + 4, y + 513), label, fill=(31, 36, 39), font=label_font)
canvas.save(RENDERS / "contact-sheet.jpg", quality=95, subsampling=0)
(RENDERS / "image-checks.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(RENDERS / "contact-sheet.jpg")
