#!/usr/bin/env python3
"""
Build the US ZIP-centroid lookup table for the "Find my town" feature.

Emits public/data/geo/zip-centroids.json — a compact { "<zip>": [lat, lon] } map
used (lazy-loaded, client-side) to turn a typed ZIP into a coordinate, which is
then compared against the 19 pilot cities to find the nearest one.

Source: the public GeoNames US postal dump (CC BY 4.0). Downloaded with stdlib
only (no pandas — the system pandas is an incompatible arch). One-time/occasional
regen; the output is committed, like the rest of public/data/.

Usage:
    python3 pipeline/build_geo.py
"""

import csv
import io
import json
import ssl
import urllib.request
import zipfile
from pathlib import Path

URL = "https://download.geonames.org/export/zip/US.zip"
OUT = Path(__file__).resolve().parents[1] / "public" / "data" / "geo" / "zip-centroids.json"


def _ssl_context() -> ssl.SSLContext:
    # macOS python.org builds often lack root certs, so verify against certifi's
    # bundle. We never disable verification (no MITM exposure); if certifi is
    # missing, fail loudly with an install hint.
    try:
        import certifi
    except ImportError as e:
        raise SystemExit("Missing dependency: pip install certifi") from e
    return ssl.create_default_context(cafile=certifi.where())


def main() -> None:
    print(f"Downloading {URL} …")
    with urllib.request.urlopen(URL, timeout=60, context=_ssl_context()) as resp:
        raw = resp.read()

    table: dict[str, list[float]] = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        with zf.open("US.txt") as fh:
            text = io.TextIOWrapper(fh, encoding="utf-8")
            # Tab-separated: country, postal_code, place, admin1, admin1_code,
            # admin2, admin2_code, admin3, admin3_code, latitude, longitude, accuracy
            for row in csv.reader(text, delimiter="\t"):
                if len(row) < 11:
                    continue
                zip_code = row[1].strip()
                if len(zip_code) != 5 or not zip_code.isdigit():
                    continue
                if zip_code in table:  # keep first occurrence; centroid is fine
                    continue
                try:
                    lat = round(float(row[9]), 4)  # 4 decimals ≈ 11 m
                    lon = round(float(row[10]), 4)
                except ValueError:
                    continue
                table[zip_code] = [lat, lon]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(table, separators=(",", ":")))
    size_kb = OUT.stat().st_size / 1024
    print(f"Wrote {len(table):,} ZIP centroids → {OUT} ({size_kb:,.0f} KB)")


if __name__ == "__main__":
    main()
