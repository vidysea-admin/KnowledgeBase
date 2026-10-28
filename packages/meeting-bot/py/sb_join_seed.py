"""sb_join: seeded capture-slot profiles (w24-signedslots).

The owned-profile check refuses any pre-populated user-data-dir as "Legacy occupied or unproved".
A capture slot seeded with a signed-in copy (small session files only) carries `.lkb-seed.json`,
written by the recorder's seeding step with a per-run nonce, the writer's pid and this slot's path.
The marker is trusted only when its nonce equals the one the launcher passed for THIS launch
(LKB_SEED_NONCE) and its slot path is this directory; a stale or copied marker is therefore inert.
Then, and only then, `Local State` and the one selected sub-profile directory are accepted next to the
ownership lock. The recorder's own control files (`.lkb-*`: the per-slot capture lock, readiness
records) are accepted under the same marker, because the TS side creates them before Python looks.
Any other entry still refuses.
"""
import json
import os
import re

SEED_MARKER = ".lkb-seed.json"
OWN_CONTROL_FILE = re.compile(r"^\.lkb-[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")


def _valid_marker(root, nonce):
    if not nonce:
        return False
    path = os.path.join(root, SEED_MARKER)
    try:
        if os.path.islink(path) or not os.path.isfile(path) or os.path.getsize(path) > 4096:
            return False
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        return (isinstance(data, dict) and data.get("version") == 1 and data.get("nonce") == nonce
                and isinstance(data.get("pid"), int) and not isinstance(data.get("pid"), bool)
                and isinstance(data.get("slot"), str)
                and os.path.normcase(os.path.abspath(data["slot"])) == os.path.normcase(os.path.abspath(root)))
    except (OSError, ValueError):
        return False


def unproved_entries(root, names, profile_directory=None, nonce=None):
    """Entries that keep a profile without an ownership ledger from being treated as owned."""
    if nonce is None:
        nonce = os.environ.get("LKB_SEED_NONCE")
    allowed = {".lkb-profile.lock"}
    if SEED_MARKER in names and _valid_marker(root, nonce):
        allowed |= {SEED_MARKER, "Local State", profile_directory or "Default"}
    seeded = SEED_MARKER in names and _valid_marker(root, nonce)
    return [name for name in names if name not in allowed and not (
        seeded and OWN_CONTROL_FILE.match(name) and os.path.isfile(os.path.join(root, name)) and not os.path.islink(os.path.join(root, name)))]
