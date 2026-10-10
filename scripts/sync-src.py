#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「开发主本」同步到仓库的 src/ 下，保证仓库镜像用的是最新页面。

默认源：仓库上级目录的 ts-translate.html（本项目的主本位置）
目标：  仓库 src/ts-translate.html

    python scripts/sync-src.py                       # 用默认源
    python scripts/sync-src.py --src D:\\a.html      # 指定源
    python scripts/sync-src.py --check               # 只比对，不复制

同步后会打印两边版本号，方便确认同步的是哪一版。
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, "src", "ts-translate.html")
DEFAULT_SRC = os.path.join(os.path.dirname(ROOT), "ts-translate.html")


def version_of(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        m = re.search(r'ZTW\.VER\s*=\s*["\']([\d.]+)["\']', f.read())
    return m.group(1) if m else "未知"


def sha_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()[:12]


def main() -> int:
    ap = argparse.ArgumentParser(description="同步页面主本到仓库 src/")
    ap.add_argument("--src", default=DEFAULT_SRC, help="源文件路径")
    ap.add_argument("--check", action="store_true", help="只比对不复制")
    ns = ap.parse_args()

    src = os.path.abspath(ns.src)
    if not os.path.isfile(src):
        print("[sync] 源文件不存在：%s" % src)
        return 1
    if not os.path.isfile(DST):
        print("[sync] 目标文件不存在：%s" % DST)
        return 1

    sv, dv = version_of(src), version_of(DST)
    ss, ds = sha_of(src), sha_of(DST)
    print("[sync] 源：%s\n       v%s  %s  %d 字节" % (src, sv, ss, os.path.getsize(src)))
    print("[sync] 目标：%s\n       v%s  %s  %d 字节" % (DST, dv, ds, os.path.getsize(DST)))

    if ss == ds:
        print("[sync] 两边一致，无需同步")
        return 0
    if ns.check:
        print("[sync] 两边不一致（--check 模式，不复制）")
        return 2

    shutil.copy2(src, DST)
    print("[sync] 已同步：%s → %s（v%s）" % (src, DST, version_of(DST)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
