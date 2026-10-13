"""sb_join: command line, bounded registration-instruction validation and managed driver checks (moved verbatim from main())."""
import argparse
import json
import os
import sys


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--profile", required=True)
    ap.add_argument("--profile-directory", default=None, help="existing physical Chrome subprofile under --profile")
    ap.add_argument("--title", required=True)
    ap.add_argument("--stop-file", required=True)
    ap.add_argument("--reload-file", default=None,
                     help="T-031: sentinel; if present, force an immediate reload/rejoin then delete it")
    ap.add_argument("--no-click", action="store_true", help="never auto-click (login/dry-run mode)")
    ap.add_argument("--capture-extension", default=None, help="unpacked tab audio/video recorder extension")
    ap.add_argument("--browser-executable", default=None, help="project-managed Chromium/Chrome for Testing binary")
    ap.add_argument("--cleanup-only", action="store_true", help="terminate only exact owned profile browser processes, without launching")
    ap.add_argument("--registration-stdin", action="store_true", help="single explicit registration attempt from bounded JSON stdin")
    a = ap.parse_args()
    return a


def load_registration(a):
    registration = None
    if a.registration_stdin:
        registration = json.loads(sys.stdin.read(16385))
        if len(json.dumps(registration)) > 16384:
            raise RuntimeError("Registration instructions refused")
        a.url = registration["url"]
        from urllib.parse import urlsplit
        parsed = urlsplit(a.url)
        hosts = registration.get("allowedHosts", [])
        operator, form = registration.get("operator", {}), registration.get("form", {})
        fields = form.get("fields", {})
        keys = {"firstName", "lastName", "email", "organization"}
        values = list(operator.values()) + list(fields.values()) + [form.get("formSelector"), form.get("submitSelector")]
        if (form.get("mode") != "native-html" or not isinstance(hosts, list) or not 1 <= len(hosts) <= 20
                or not all(isinstance(h, str) and h == h.lower() and len(h) <= 253 for h in hosts)
                or set(operator) != set(fields) or not {"firstName", "lastName", "email"} <= set(fields)
                or not set(fields) <= keys or len(set(fields.values())) != len(fields)
                or not all(isinstance(v, str) and v.strip() and len(v) <= 256
                           and all(ord(c) >= 32 and ord(c) != 127 for c in v) for v in values)):
            raise RuntimeError("Registration operator or form refused")
        local = registration.get("localFixture") is True and parsed.hostname in ("127.0.0.1", "localhost")
        if (parsed.scheme != "https" and not (local and parsed.scheme == "http")
                or parsed.username or parsed.password or parsed.fragment or parsed.hostname not in hosts
                or a.capture_extension or a.cleanup_only):
            raise RuntimeError("Registration URL refused")
    return registration


def managed_driver(a, emit):
    driver_version = None
    if a.browser_executable:
        import pathlib
        import re
        import subprocess
        import seleniumbase
        from seleniumbase.core import browser_launcher, detect_b_ver
        if seleniumbase.__version__ != "4.51.9":
            raise RuntimeError("Managed capture requires pinned SeleniumBase 4.51.9; run setup")
        driver_dir = pathlib.Path(seleniumbase.__file__).parent / "drivers"
        if a.browser_executable == "cft":
            platform_dir, browser_name = (("chrome-win64", "chrome.exe") if os.name == "nt"
                                          else ("chrome-linux64", "chrome"))
            a.browser_executable = str(driver_dir / "cft_drivers" / platform_dir / browser_name)
        browser = pathlib.Path(a.browser_executable)
        driver = driver_dir / ("uc_driver.exe" if os.name == "nt" else "uc_driver")
        if not browser.is_file() or not driver.is_file():
            raise RuntimeError("Managed Chrome and installed UC driver are required; run setup")
        browser_version = detect_b_ver.get_browser_version_from_binary(str(browser))
        installed = subprocess.run([str(driver), "--version"], capture_output=True,
                                   text=True, timeout=20, check=True)
        version = re.search(r"ChromeDriver\s+(\d+(?:\.\d+){3})", installed.stdout)
        if not browser_version or not version:
            raise RuntimeError("Cannot verify managed browser/driver versions")
        driver_version = version.group(1)
        if browser_version.split(".")[0] != driver_version.split(".")[0]:
            raise RuntimeError("Managed Chrome and installed UC driver major versions differ")
        browser_launcher.override_driver_dir(str(driver_dir))
        emit("managed-driver", browser_version=browser_version, driver_version=driver_version)
    return driver_version
