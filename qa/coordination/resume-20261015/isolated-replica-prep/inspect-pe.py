"""Passive byte parsing only; never loads or executes the PE image."""
import hashlib
import json
import re
import struct
import sys
from pathlib import Path

image = Path(sys.argv[1])
data = image.read_bytes()
assert data[:2] == b"MZ"
offset = struct.unpack_from("<I", data, 0x3C)[0]
assert data[offset:offset + 4] == b"PE\0\0"
machine, sections = struct.unpack_from("<HH", data, offset + 4)
optional_size = struct.unpack_from("<H", data, offset + 20)[0]
optional = offset + 24
assert struct.unpack_from("<H", data, optional)[0] == 0x20B
manifest_matches = re.findall(br"<\?xml[^\x00]{0,20000}?</assembly>", data)
levels = sorted(set(re.findall(br'requestedExecutionLevel[^>]*level=["\x27]([^"\x27]+)', b"\n".join(manifest_matches))))
print(json.dumps({"path": str(image), "bytes": len(data),
                  "sha256": hashlib.sha256(data).hexdigest(), "machineHex": hex(machine),
                  "sections": sections, "manifestMatches": len(manifest_matches),
                  "requestedExecutionLevels": [v.decode("ascii") for v in levels],
                  "inspectionMethod": "PE header plus bounded ASCII XML pattern; not complete resource-tree decoding",
                  "binaryExecuted": False, "unprivilegedStartupProven": False}))
