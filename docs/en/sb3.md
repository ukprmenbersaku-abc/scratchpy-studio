# Inside an .sb3 file

A Scratch `.sb3` file is a ZIP archive. It contains `project.json` and image and audio files referenced by the project.

## Project structure

`project.json` describes targets (the stage and sprites), variables, lists, broadcasts, blocks, costumes, sounds, monitors and project metadata. Blocks have unique IDs and are linked using `next`, `parent`, `inputs` and `fields`. Scripts start at top-level event or custom-block definitions.

Costumes and sounds refer to assets by content-based filenames such as `assetId.svg` or `assetId.wav`. ScratchPy Studio keeps imported assets when possible and includes them in the exported archive.

## Why not everything round-trips

Some blocks are specific to extensions or execution environments. Unsupported blocks and detached scripts may be turned into comments, and their behavior cannot be recreated on export. Inspect the import log and retain the original project.

For the detailed format analysis, input encodings, mutations and examples, see the Japanese reference `docs/02-sb3-format-analysis.md`.
