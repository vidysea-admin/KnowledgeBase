def test_owned_temporary_fixture(tmp_path, tmp_path_factory):
    p = tmp_path / "probe.txt"
    p.write_text("setup-only", encoding="utf-8")
    assert p.read_text(encoding="utf-8") == "setup-only"
    assert tmp_path.parent == tmp_path_factory.getbasetemp()
    assert tmp_path_factory.mktemp("plain", numbered=False).is_dir()
    try:
        tmp_path_factory.mktemp("../escape")
    except ValueError:
        pass
    else:
        raise AssertionError("pytest traversal guard was bypassed")
