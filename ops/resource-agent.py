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
BIND = os.environ.get("FORGEOPS_MONITOR_BIND", "127.0.0.1")


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
    containers = []
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
    try:
        names = subprocess.check_output(["docker", "ps", "--format", "{{.Names}}"], text=True, timeout=3).splitlines()
        projects = {}
        if names:
            inspected = json.loads(subprocess.check_output(["docker", "inspect", *names], text=True, timeout=4))
            for item in inspected:
                labels = item.get("Config", {}).get("Labels", {}) or {}
                projects[item.get("Name", "").lstrip("/")] = labels.get("com.docker.compose.project", "other")
            output = subprocess.check_output(["docker", "stats", "--no-stream", "--format", "{{json .}}", *names], text=True, timeout=8)
            for line in output.splitlines():
                item = json.loads(line)
                used, limit = item.get("MemUsage", "0B / 0B").split(" / ")
                def memory_mb(value):
                    number = float("".join(char for char in value if char.isdigit() or char == ".") or 0)
                    unit = "".join(char for char in value if char.isalpha()).lower()
                    return number * ({"b": 1 / 1024 / 1024, "kb": 1 / 1024, "kib": 1 / 1024, "mb": 1, "mib": 1, "gb": 1024, "gib": 1024}.get(unit, 1))
                name = item.get("Name", "unknown")
                containers.append({"name": name, "composeProject": projects.get(name, "other"), "cpuUsedPercent": float(item.get("CPUPerc", "0").rstrip("%")), "memoryUsedMb": round(memory_mb(used), 1), "memoryLimitMb": round(memory_mb(limit), 1)})
    except (FileNotFoundError, subprocess.SubprocessError, ValueError, json.JSONDecodeError):
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
        "containers": containers,
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
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
