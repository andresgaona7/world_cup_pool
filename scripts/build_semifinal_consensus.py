#!/usr/bin/env python3
"""Build Semifinals consensus data and the legacy consensus page."""

from __future__ import annotations

import build_quarterfinal_consensus as builder


builder.APP_DIR = builder.ROOT / "apps" / "semifinal_consensus"
builder.CONSENSUS_PATH = builder.GENERATED_DIR / "semifinal_consensus.json"
builder.VISUALIZATION_PATH = builder.APP_DIR / "index.html"
builder.STAGE = "semifinal"
builder.STAGE_LABEL = "Semifinals"
builder.DATA_SCRIPT_ID = "semifinal-consensus-data"
builder.ASSET_PREFIX = "../quarterfinal_consensus/"


if __name__ == "__main__":
    builder.main()
