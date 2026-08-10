#!/usr/bin/env python3
"""Minimal read-only Linux resource agent for ForgeOps."""

import json
import os
import shutil
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("FORGEOPS_MONITOR_TOKEN", "")
PORT = int(os.environ.get("FORGEOPS_MONITOR_PORT", "9108"))


def cpu_sample():
    def read():
        with open("/proc/stat", encoding="utf-8") as stream:
            values = [int(value) for value in stream.readline().split()[1:]]
        return sum(values), values[3] + values[4]
    total_a, idle_a = read()
    time.sleep(0.15)
    total_b, idle_b = read()
    return round((1 - (idle_b - idle_a) / max(1, total_b - total_a)) * 100, 1)


def snapshot():
    memory = {}
    with open("/proc/meminfo", encoding="utf-8") as stream:
        for line in stream:
            key, value = line.split(":", 1)
            memory[key] = int(value.strip().split()[0])
    disk = shutil.disk_usage("/")
    gpus = []
    try:
        output = subprocess.check_output([
            "nvidia-smi", "--query-gpu=name,memory.total,memory.used,utilization.gpu",
            "--format=csv,noheader,nounits",
        ], text=True, timeout=2)
        for line in output.splitlines():
            name, total, used, utilization = [item.strip() for item in line.split(",")]
            gpus.append({"name": name, "memoryTotalMb": int(total), "memoryUsedMb": int(used), "utilizationPercent": int(utilization)})
    except (FileNotFoundError, subprocess.SubprocessError, ValueError):
        pass
    total_mb = round(memory["MemTotal"] / 1024)
    available_mb = round(memory.get("MemAvailable", memory.get("MemFree", 0)) / 1024)
    return {
        "cpuTotal": os.cpu_count() or 1,
        "cpuUsedPercent": cpu_sample(),
        "memoryTotalMb": total_mb,
        "memoryUsedMb": total_mb - available_mb,
        "diskTotalGb": round(disk.total / 1024 ** 3, 1),
        "diskUsedGb": round(disk.used / 1024 ** 3, 1),
        "gpu": gpus,
        "collectedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/v1/resources":
            self.send_error(404)
            return
        if not TOKEN or self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_error(401)
            return
        body = json.dumps(snapshot()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
