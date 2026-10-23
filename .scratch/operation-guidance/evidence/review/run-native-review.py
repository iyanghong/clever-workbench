#!/usr/bin/env python3
"""Hold the Electron GUI lock while a human/agent checks native mouse behavior."""

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time


executable = pathlib.Path(
    "/Users/kuku/code/.cwb-guidance-tickets/review-package/release/mac-arm64/"
    "Clever Workbench.app/Contents/MacOS/Clever Workbench"
)
directory = pathlib.Path(tempfile.mkdtemp(prefix="cwb-guidance-review-native-"))
environment = os.environ.copy()
environment.pop("ELECTRON_RUN_AS_NODE", None)
environment.pop("VITE_DEV_SERVER_URL", None)
environment["CLEVER_WORKBENCH_DATA_DIR"] = str(directory)
environment["CWB_TEST_MOCK_KEYCHAIN"] = "1"
process = subprocess.Popen(
    [str(executable), "--use-mock-keychain"],
    env=environment,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
try:
    time.sleep(1)
    if process.poll() is not None:
        raise RuntimeError(f"隔离应用启动失败，退出码 {process.returncode}")
    info = {
        "app": str(executable.parents[2]),
        "executable": str(executable),
        "pid": process.pid,
        "temporaryData": str(directory),
        "mockKeychain": True,
    }
    print(json.dumps(info, ensure_ascii=False), flush=True)
    process.wait()
finally:
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=10)
    if directory.is_relative_to(pathlib.Path(tempfile.gettempdir()).resolve()):
        shutil.rmtree(directory)
