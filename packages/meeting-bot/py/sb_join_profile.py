"""sb_join: selected Chrome subprofile validation and the scoped UC constructor adaptation (moved verbatim from sb_join.py)."""
import contextlib
import os


def existing_profile_directory(parent, selected):
    """An explicit selector reuses a physical subprofile without changing its parent."""
    if selected is None:
        return None
    import pathlib
    import re
    if (not isinstance(selected, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}", selected)
            or ".." in selected or selected.strip() != selected or selected.endswith((".", " "))):
        raise RuntimeError("Invalid browser profile-directory")
    root = pathlib.Path(parent)
    directory, preferences = root / selected, root / selected / "Preferences"
    if not root.is_absolute():
        raise RuntimeError("Selected browser profile requires an absolute parent")
    for target in (root, directory, preferences):
        try:
            if any(getattr(os.lstat(part), "st_file_attributes", 0) & 0x400 or part.is_symlink()
                   for part in (target, *target.parents)):
                raise RuntimeError("Redirected selected profile refused")
            if os.path.normcase(os.path.realpath(target)) != os.path.normcase(os.path.abspath(target)):
                raise RuntimeError("Noncanonical selected profile refused")
        except OSError as error:
            raise RuntimeError("Selected browser profile must already exist") from error
    if not root.is_dir() or not directory.is_dir() or not preferences.is_file():
        raise RuntimeError("Selected browser profile requires a physical directory and Preferences")
    return selected


def validate_uc_profile_support(selected):
    if selected is None:
        return
    import inspect
    import seleniumbase
    from seleniumbase import undetected
    if seleniumbase.__version__ != "4.51.9" or not isinstance(undetected.Chrome, type):
        raise RuntimeError("Selected profile requires supported pinned SeleniumBase 4.51.9")
    try:
        signature = inspect.signature(undetected.Chrome.__init__)
    except (TypeError, ValueError) as error:
        raise RuntimeError("Selected profile constructor capability unsupported") from error
    for name in ("options", "suppress_welcome"):
        parameter = signature.parameters.get(name)
        if parameter is None or parameter.kind not in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY):
            raise RuntimeError("Selected profile constructor capability unsupported")


@contextlib.contextmanager
def selected_uc_profile(selected):
    """SB omits this documented UC option; scope its constructor adaptation to one launch."""
    if selected is None:
        yield
        return
    validate_uc_profile_support(selected)
    from seleniumbase import undetected
    original = undetected.Chrome

    class SelectedChrome(original):
        def __init__(self, *args, **kwargs):
            options = kwargs.get("options", args[0] if args else None)
            arguments = getattr(options, "arguments", None)
            if not isinstance(arguments, list) or [arg for arg in arguments if arg.startswith("--profile-directory=")] != ["--profile-directory=" + selected]:
                raise RuntimeError("Selected profile requires exactly one effective directory argument")
            for welcome in ("--no-default-browser-check", "--no-first-run", "--no-service-autorun", "--password-store=basic"):
                if welcome not in arguments:
                    options.add_argument(welcome)
            kwargs["suppress_welcome"] = False
            super().__init__(*args, **kwargs)

    undetected.Chrome = SelectedChrome
    try:
        yield
    finally:
        undetected.Chrome = original
