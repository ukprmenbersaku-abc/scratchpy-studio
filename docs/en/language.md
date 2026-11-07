# ScratchPy language overview

ScratchPy has Python-style indentation and explicit types for variables. A program contains a stage and one or more sprites, with declarations and event scripts nested inside each target.

```python
stage:
    var score: int = 0 @show

sprite Cat:
    costume costume1
    on flag:
        say("Hello!")
        repeat 10:
            move(10)
            wait(0.1)
```

## Types and variables

Common types are `int`, `float`, `str`, `bool` and `list[T]`. Declare variables with `var` and lists with `list`; examples include `var score: int = 0` and `list items: list[str] = []`. The static checker reports incompatible values before export. The `@show`, `@hide` and `@cloud` annotations control supported Scratch monitors and cloud variables.

## Events and control flow

Start scripts using `on flag:`, `on click:`, `on clone:`, `on key "space":` or `on receive "message":`. Use `if` / `elif` / `else`, `repeat`, `forever`, `while` and `wait` for control flow. Statements are indented inside their parent block.

## Custom blocks

Define a typed custom block with `def` and call it from a script:

```python
sprite Cat:
    def jump(power: int):
        change_y(power)
    on flag:
        jump(10)
```

`@warp` enables Scratch's run-without-screen-refresh mode. Built-in functions map to Scratch blocks; for example `move(10)`, `say("Hello")`, `broadcast("go")` and `key_pressed("space")`.

The full catalog and precise grammar are documented in Japanese in `docs/01-scratchpy-language.md`. Not every Scratch extension has a ScratchPy equivalent.
