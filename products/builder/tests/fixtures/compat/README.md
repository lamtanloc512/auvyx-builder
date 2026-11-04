# Compatibility fixtures

Markup saved by released versions. Every file here must stay valid forever: if a block's `save()` changes,
add a `deprecated` entry to the block (and teach `Studio::tree` the old shape) instead of breaking these.

On each release: copy `tests/fixtures/studio.html` to `compat/<version>-studio.html`.
