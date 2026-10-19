"""Seeded capture-slot ownership boundary: pure filesystem, no browser."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from sb_join_seed import SEED_MARKER, unproved_entries


def slot(tmp_path, names, marker=None):
    root = tmp_path / "slot"
    root.mkdir()
    for name in names:
        (root / name).mkdir() if name == "Profile 1" else (root / name).write_text("{}")
    if marker is not None:
        (root / SEED_MARKER).write_text(marker)
    return str(root), sorted(os.listdir(root))


def test_empty_and_lock_only_profiles_stay_owned(tmp_path):
    root, names = slot(tmp_path, [".lkb-profile.lock"])
    assert unproved_entries(root, names) == []


def test_unseeded_prepopulated_profile_is_still_refused(tmp_path):
    root, names = slot(tmp_path, ["Local State", "Profile 1"])
    assert unproved_entries(root, names, "Profile 1") == ["Local State", "Profile 1"]


def test_seed_marker_accepts_only_local_state_and_the_selected_profile(tmp_path):
    root, names = slot(tmp_path, [".lkb-profile.lock", "Local State", "Profile 1", "Cookies"], json.dumps({"version": 1}))
    assert unproved_entries(root, names, "Profile 1") == ["Cookies"]
    assert unproved_entries(root, [n for n in names if n != "Cookies"], "Profile 1") == []
    assert unproved_entries(root, [n for n in names if n != "Cookies"], "Default") == ["Profile 1"]


def test_bad_marker_gives_no_trust(tmp_path):
    for index, marker in enumerate(["not json", json.dumps({"version": 2}), json.dumps([1]), "x" * 5000]):
        base = tmp_path / str(index)
        base.mkdir()
        root, names = slot(base, ["Local State", "Profile 1"], marker)
        assert unproved_entries(root, names, "Profile 1") == names, marker[:20]
