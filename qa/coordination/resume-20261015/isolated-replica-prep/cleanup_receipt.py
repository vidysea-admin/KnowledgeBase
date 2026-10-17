"""Pure orchestration seam; fake-only tests inject every side effect."""
import json
import os
from pathlib import Path


class ReceiptPersistenceFailed(RuntimeError):
    pass


def durable_write(path, payload):
    temporary = path.with_suffix(path.suffix + ".partial")
    with temporary.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(payload, sort_keys=True))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    # Windows file flush above is durability evidence; directory fsync unavailable.


def finalize(receipt, close_job, cleanup, primary, fallback):
    """Receipt writer belongs OUTSIDE private runtime. Never serialize exceptions."""
    try:
        try:
            close_job()
            receipt["ownedJobClosed"] = True
        except BaseException as error:
            receipt["ownedJobClosed"] = False
            receipt["jobCloseErrorType"] = type(error).__name__
        if receipt["ownedJobClosed"]:
            try:
                receipt["ownedRuntimeRemoved"] = bool(cleanup())
            except BaseException as error:
                receipt["ownedRuntimeRemoved"] = False
                receipt["cleanupErrorType"] = type(error).__name__
        else:
            receipt["ownedRuntimeRemoved"] = False
        receipt["ownedRemnantsPossible"] = not receipt["ownedRuntimeRemoved"]
    finally:
        try:
            primary(receipt)
        except BaseException as error:
            receipt["primaryReceiptErrorType"] = type(error).__name__
            try:
                fallback(receipt)
            except BaseException as fallback_error:
                # If storage itself refuses both writes, persistence is impossible:
                # emit only a fixed marker and fail, never claim a durable receipt.
                raise ReceiptPersistenceFailed(type(fallback_error).__name__) from None
