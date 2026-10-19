"""Seeded capture-slot ownership boundary: pure filesystem, no browser."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from sb_join_seed import SEED_MARKER, unproved_entries

NONCE = "11111111-2222-3333-4444-555555555555"


def slot(tmp_path, names, marker=None):
    root = tmp_path / "slot"
    root.mkdir()
    for name in names:
        (root / name).mkdir() if name == "Profile 1" else (root / name).write_text("{}")
    if marker is not None:
        (root / SEED_MARKER).write_text(marker if isinstance(marker, str) else json.dumps(marker))
    return str(root), sorted(os.listdir(root))


def good(root):
    return {"version": 1, "nonce": NONCE, "pid": 4242, "slot": root}


def test_empty_and_lock_only_profiles_stay_owned(tmp_path):
    root, names = slot(tmp_path, [".lkb-profile.lock"])
    assert unproved_entries(root, names, nonce=NONCE) == []


def test_unseeded_prepopulated_profile_is_still_refused(tmp_path):
    root, names = slot(tmp_path, ["Local State", "Profile 1"])
    assert unproved_entries(root, names, "Profile 1", NONCE) == ["Local State", "Profile 1"]


def test_marker_with_this_launchs_nonce_accepts_only_local_state_and_selected_profile(tmp_path):
    base = tmp_path / "ok"
    base.mkdir()
    root, names = slot(base, [".lkb-profile.lock", "Local State", "Profile 1", "Cookies"], None)
    (base / "slot" / SEED_MARKER).write_text(json.dumps(good(root)))
    names = sorted(os.listdir(root))
    assert unproved_entries(root, names, "Profile 1", NONCE) == ["Cookies"]
    assert unproved_entries(root, [n for n in names if n != "Cookies"], "Profile 1", NONCE) == []
    assert unproved_entries(root, [n for n in names if n != "Cookies"], "Default", NONCE) == ["Profile 1"]


def test_stale_marker_wrong_nonce_missing_nonce_or_other_slot_gives_no_trust(tmp_path):
    cases = []
    for index, (marker, nonce) in enumerate([
        ({"version": 1, "nonce": "stale", "pid": 1, "slot": "{root}"}, NONCE),   # marker from an earlier run
        ({"version": 1, "nonce": NONCE, "pid": 1, "slot": "{root}"}, None),      # launcher passed no nonce
        ({"version": 1, "nonce": NONCE, "pid": 1, "slot": "C:/elsewhere"}, NONCE),  # copied from another slot
        ({"version": 1, "nonce": NONCE, "slot": "{root}"}, NONCE),               # no pid
        ({"version": 2, "nonce": NONCE, "pid": 1, "slot": "{root}"}, NONCE),
        ("not json", NONCE), ("x" * 5000, NONCE), ([1], NONCE),
    ]):
        base = tmp_path / str(index)
        base.mkdir()
        root, _ = slot(base, ["Local State", "Profile 1"])
        if isinstance(marker, dict):
            marker = {k: (v.replace("{root}", root) if isinstance(v, str) else v) for k, v in marker.items()}
        (base / "slot" / SEED_MARKER).write_text(marker if isinstance(marker, str) else json.dumps(marker))
        names = sorted(os.listdir(root))
        got = unproved_entries(root, names, "Profile 1", nonce) if nonce else unproved_entries(root, names, "Profile 1", "")
        assert got == names, (index, got)
