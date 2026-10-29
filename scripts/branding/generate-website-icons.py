"""Package the existing official navigation artwork; requires Python Pillow.

No recoloring, redrawing, or background removal. The black artwork is contained
and centered on a square black canvas so Apple icons are fully opaque.
"""
from pathlib import Path
from PIL import Image, ImageOps
import base64
import hashlib
import json

root = Path(__file__).resolve().parents[2]
public = root / "artifacts/ea-cloud/public"
source = public / "ea-cloud-nav-logo.png"
version = hashlib.sha256(source.read_bytes()).hexdigest()[:12]
artwork = Image.open(source).convert("RGB")


def icon(size):
    fitted = ImageOps.contain(artwork, (size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), "black")
    canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


for size in (16, 32, 48, 180, 192, 512):
    icon(size).save(public / f"ea-cloud-icon-{size}.png", optimize=True)
icon(48).save(public / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
icon(180).save(public / "apple-touch-icon.png", optimize=True)
# Keep the old well-known SVG URL valid, but remove its orange placeholder.
encoded = base64.b64encode((public / "ea-cloud-icon-192.png").read_bytes()).decode()
(public / "favicon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">'
    f'<image width="192" height="192" href="data:image/png;base64,{encoded}"/>'
    '</svg>\n'
)
manifest = {
    "name": "EA Cloud", "short_name": "EA Cloud", "start_url": "/", "display": "browser",
    "icons": [{"src": f"/ea-cloud-icon-{s}.png?v={version}", "sizes": f"{s}x{s}", "type": "image/png", "purpose": "any"} for s in (192, 512)],
}
(public / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Generated official website icons; cache version {version}")
