# Architecture overview

The application is a React and TypeScript client. All conversion runs locally in the browser.

- `src/core/lang/`: lexer, parser, abstract syntax tree, printer and static type checker.
- `src/core/sb3/`: `.sb3` ZIP handling, asset management, importer, exporter and project validation.
- `src/app/`: text editor, Blockly workspace, diagnostic panels and documentation UI.
- `src/tests/`: automated unit, conversion, UI and real-project fixture tests.

The pipeline parses source into an AST, type-checks it, builds a Scratch project and packages the project with its assets. Import performs the reverse conversion where supported. Blockly edits pass through the same language pipeline and are explicitly applied to the editor.

Run `npm ci`, then `npm run dev:ja` or `npm run dev:en`. Use `npm test` and `npm run build` to verify changes. The complete architecture reference is `docs/04-architecture.md` in Japanese.
