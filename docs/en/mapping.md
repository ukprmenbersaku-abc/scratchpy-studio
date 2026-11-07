# Conversion mapping overview

ScratchPy declarations map to Scratch targets, variables, lists, costumes and sounds. Event handlers map to Scratch event hats; calls such as `move`, `say` and `wait` map to the corresponding opcodes. Typed `def` declarations and calls map to Scratch procedures.

| ScratchPy | Scratch concept |
| --- | --- |
| `stage:` / `sprite Cat:` | Stage / sprite target |
| `on flag:` | When green flag clicked |
| `move(10)` | Move 10 steps |
| `repeat 10:` | Repeat block |
| `var score: int = 0` | Variable declaration |
| `def jump(power: int):` | Custom block definition |

## What to check

Conversion is not guaranteed to be lossless for every project. Unsupported extensions, unsupported opcodes and detached scripts may be omitted or represented as comments. Read the log after importing and save a backup of the original `.sb3`.

For opcode-level mappings and encoding details, see the Japanese reference `docs/03-conversion-mapping.md`.
