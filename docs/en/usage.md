# Getting started with ScratchPy Studio

ScratchPy Studio converts Scratch `.sb3` projects to ScratchPy, a beginner-friendly, typed language with Python-style syntax, and back again. Conversion happens in your browser. If you choose to use the AI Assistant, the current code, conversation, diagnostics and language reference are sent to your chosen AI provider after your consent.

## 1. Open or create a project

Choose a sample from the toolbar, or click **Open .sb3** and select a Scratch file. You can also drag a `.sb3` file into the editor. The imported text appears in the code editor; any original costumes and sounds are kept for export. Open **Log** to read conversion notes.

## 2. Edit and check

The **Code** tab is a text editor with line numbers. The **Blocks** tab presents the same program in a Blockly workspace. Drag blocks from the toolbox, connect them inside a stage or sprite and edit their fields. Click **Apply to code** to commit block edits. The block editor does not apply changes automatically.

**Reload from code** discards uncommitted block edits after confirmation. If the code contains syntax errors or cannot be represented faithfully as blocks, applying changes is disabled to protect the source. Unconnected blocks must be connected or removed first.

The **Diagnostics** tab shows errors and warnings; click a diagnostic to jump to its line. Error details from the conversion engine are currently in Japanese. The **Structure** and **JSON** tabs help you inspect your program.

## 3. Export to Scratch

Click **Download .sb3**, then open the downloaded file in the [Scratch editor](https://scratch.mit.edu/projects/editor/) using File → Load from your computer, or use [TurboWarp](https://turbowarp.org/). If there are errors, fix them first. Existing project assets are included when available.

## Important limitations

Some Scratch or TurboWarp extensions, unsupported blocks, and detached scripts cannot be represented in ScratchPy. They may be replaced with comments and lost when re-exported. Always read the import log and keep a copy of your original file. The block editor may disable applying changes when a faithful round trip is not possible.

This English guide is an overview. The complete technical reference is available in the Japanese version of the app and in the project's `docs/` directory.

## AI Assistant (Studio editions)

Select Google Gemini, OpenAI, or Anthropic, enter your own API key and model ID, acknowledge the data transfer and potential charges, then send a request. The key is kept only in page memory, but can be exposed to the device owner, browser extensions and developer tools. Avoid shared devices and restrict key permissions and spending. Code, conversation, diagnostics and the ScratchPy reference are sent directly to the chosen provider; image and sound files themselves are not sent. Browser CORS and organizational policies can block requests, especially for some Anthropic organizations.

The assistant checks syntax, static types and .sb3 structure, and may make up to two paid repair attempts after the initial request. It cannot run Scratch or generate assets. Review the proposal before explicitly applying it; proposals cannot be applied if the project has changed, errors remain or block edits are uncommitted. Keep the original .sb3 and test the result in Scratch.
