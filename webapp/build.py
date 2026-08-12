#!/usr/bin/env python3
"""Inline geom.js / app.js / style.css / bikeramp.scad into one self-contained page.

Emits two builds of the same app:

  webapp/coasting-hill.html   fragment -- no <head>; the Artifact host supplies one
  docs/index.html             standalone document, for GitHub Pages

    python3 webapp/build.py
"""
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
FRAGMENT = HERE / "coasting-hill.html"
PAGE = ROOT / "docs" / "index.html"

DESCRIPTION = ("Parametric generator for a printable balance-bike coasting hill: "
               "pick your printer, size the hill, download the STLs.")

page = (HERE / "page.html").read_text()
for token, text in [
    ("{{CSS}}", (HERE / "style.css").read_text()),
    ("{{GEOM}}", (HERE / "geom.js").read_text()),
    ("{{APP}}", (HERE / "app.js").read_text()),
    ("{{SCAD}}", json.dumps((ROOT / "bikeramp.scad").read_text())),
]:
    assert token in page, f"{token} missing from page.html"
    page = page.replace(token, text)
assert "{{" not in page, "unsubstituted token left in output"

FRAGMENT.write_text(page)
print(f"wrote {FRAGMENT.relative_to(ROOT)}  ({len(page) / 1024:.0f} KB)  fragment")

# Split the fragment's head-ish bits out so the standalone page is valid HTML
# rather than a <title> and <style> stranded in the body.
title = re.search(r"<title>(.*?)</title>", page, re.S).group(1)
style = re.search(r"<style>.*?</style>", page, re.S).group(0)
body = page.replace(f"<title>{title}</title>", "", 1).replace(style, "", 1).strip()

standalone = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{DESCRIPTION}">
<meta name="color-scheme" content="light dark">
<title>{title}</title>
{style}
</head>
<body>
{body}
</body>
</html>
"""
PAGE.parent.mkdir(exist_ok=True)
PAGE.write_text(standalone)
(PAGE.parent / ".nojekyll").write_text("")     # keep Pages from filtering anything
print(f"wrote {PAGE.relative_to(ROOT)}  ({len(standalone) / 1024:.0f} KB)  standalone")
