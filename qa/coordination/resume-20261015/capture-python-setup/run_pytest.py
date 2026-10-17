"""Windows sandbox adapter: inherit repository ACL only in a fresh owned temp tree.

No os/pathlib global patch, plugin suppression, fixture replacement or test edits.
Pytest retains its factory, numbering, traversal checks, retention and cleanup.
The evidence tree is repository-readable; do not use for secrets or live media.
"""
import os
from pathlib import Path
import sys

print("SETUP_PHASE pytest-import-start", flush=True)
import pytest
import _pytest.tmpdir as tmpdir
print("SETUP_PHASE pytest-import-done", flush=True)


def main():
    if os.name != "nt":
        raise RuntimeError("Windows-only setup adapter")
    args = sys.argv[1:]
    if args.count("--basetemp") != 1:
        raise RuntimeError("one explicit fresh --basetemp required")
    base = Path(args[args.index("--basetemp") + 1]).absolute()
    owner = Path(__file__).resolve().parent
    if base.parent.resolve() != owner or base.exists() or base.is_symlink():
        raise RuntimeError("basetemp must be a nonexistent immediate child of adapter directory")
    expected = Path(__file__).resolve().parents[4] / "packages/meeting-bot/py"
    print("SETUP_PHASE source-import-start", flush=True)
    import sb_join_tiles
    print("SETUP_PHASE source-import-done", flush=True)
    if Path(sb_join_tiles.__file__).resolve().parent != expected.resolve():
        raise RuntimeError("sb_join_tiles import escaped source root")
    original = tmpdir.Path

    class OwnedTempPath(type(Path())):
        def mkdir(self, mode=0o777, parents=False, exist_ok=False):
            resolved = self.absolute()
            if resolved != base and base not in resolved.parents:
                raise RuntimeError("temporary mkdir escaped owned base")
            # 0700 on Windows removes the sandbox token's inherited access.
            # Default Windows mkdir inherits existing repository ACLs, with no
            # grants or ACL writes. Restrict the adaptation to this owned tree.
            return super().mkdir(mode=0o777 if mode == 0o700 else mode,
                                 parents=parents, exist_ok=exist_ok)

    tmpdir.Path = OwnedTempPath
    class PhaseMarkers:
        def pytest_configure(self, config):
            print("SETUP_PHASE pytest-configure", flush=True)

        def pytest_collection_finish(self, session):
            print("SETUP_PHASE collection-finish", flush=True)

        def pytest_sessionfinish(self, session, exitstatus):
            print("SETUP_PHASE session-finish " + str(exitstatus), flush=True)

    try:
        print("SETUP_PHASE pytest-main-start", flush=True)
        return int(pytest.main(args, plugins=[PhaseMarkers()]))
    finally:
        tmpdir.Path = original


if __name__ == "__main__":
    raise SystemExit(main())
