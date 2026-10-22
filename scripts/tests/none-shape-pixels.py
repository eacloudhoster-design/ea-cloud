"""Compare Home screenshots, excluding the independent animated floating trigger.
Requires Pillow only in the verification environment; no application dependency.
"""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

root = Path("work/none-shape-layout")
metrics = json.loads((root / "after.json").read_text())
results = []
for layout in ("regular", "s2tone", "matrix"):
    for shape in ("orbit", "neural"):
        before = Image.open(root / f"before-{layout}-{shape}.png").convert("RGB")
        after = Image.open(root / f"after-{layout}-{shape}.png").convert("RGB")
        raw = ImageChops.difference(before, after)
        box = next(r["floating"] for r in metrics if r["viewport"]["width"] == 390
                   and r["layout"] == layout and r["shape"] == shape)
        # Its normal hover/status animation can differ between captures. Geometry
        # and all four box dimensions are compared separately by the browser test.
        region = (box["x"] - 4, box["y"] - 4,
                  box["x"] + box["width"] + 4, box["y"] + box["height"] + 4)
        diff = raw.copy()
        ImageDraw.Draw(diff).rectangle(region, fill=(0, 0, 0))
        assert diff.getbbox() is None, (layout, shape, diff.getbbox())
        results.append({"layout": layout, "shape": shape,
                        "changedPixelsOutsideFloatingTrigger": 0,
                        "rawDifferenceBounds": raw.getbbox(),
                        "excludedFloatingTriggerBounds": region})
(root / "pixel-comparison.json").write_text(json.dumps(results, indent=2) + "\n")
print("All six Orbit/Neural Home captures unchanged outside independent floating trigger animation.")
