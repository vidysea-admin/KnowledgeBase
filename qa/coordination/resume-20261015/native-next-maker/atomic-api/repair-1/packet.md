# Compiler repair 1: source checkpoint

Broker source final seal 1887 released by root before edits. Exact two source paths: API indexing/native-archive/publication.ts and DB collections/speaker-suggestions.test.ts. Raw pre-edit copies and SHA256 files retained here.

DB fixture row now has explicit generated SpeakerSuggestions contextual type, providing its nonempty provenance tuple without altering fixture contents or assertions and without an unsafe array cast.

API suggestionWriter now accepts unknown actual filter/update/options values, validates each as a nonarray record and separately validates $setOnInsert as a record before reading properties or spreading. Existing tenant/session/status, reserved nativePublication, exclusive $setOnInsert and upsert guards retained; speakerRef/personId also require strings. No any cast or weaker authority predicate added.

No tests/build/DB/provider/browser run. Broker must rerun exact failed type gates and required tests. No PASS claimed. Central neutral DTO import pin is handled only if separately frozen and sent; otherwise current API-local binding import unchanged. Actual repair time/tokens unknown.
