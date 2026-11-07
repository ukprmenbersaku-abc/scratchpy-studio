// Each server chooses its UI language at startup. The conversion core is shared.
export const EN = import.meta.env.VITE_APP_LANGUAGE === 'en';
export const t = (ja: string, en: string) => EN ? en : ja;

export const sampleTitle: Record<string, string> = {
  hello: 'Hello, ScratchPy!', game: 'Apple Catch Game',
  procs: 'Custom Blocks (Typed)', chat: 'Find the Submarine (Conditions & Lists)',
};
export const sampleDescription: Record<string, string> = {
  hello: 'Basics: events, speech, motion and variables',
  game: 'Variables, lists, random numbers, clones and messages',
  procs: 'Custom blocks with def, warp and the pen extension',
  chat: 'while, in, lists and sensing',
};

/** Translate only fixed sample literals and comments, never user-entered code. */
export function localizeSample(code: string): string {
  if (!EN) return code;
  const replacements: [string, string][] = [
    ['こんにちは ScratchPy!', 'Hello ScratchPy!'],
    ['最初の一歩: 旗クリックで動き回って、クリックで得点!', 'First steps: click the flag to move, and click the sprite to score!'],
    ['こんにちは、ScratchPy!', 'Hello, ScratchPy!'], ['クリック数: ', 'Clicks: '], ['すごい! 10回クリック!', 'Amazing! 10 clicks!'],
    ['リンゴキャッチゲーム', 'Apple Catch Game'], ['←→ キーでネコを動かして、落ちてくるリンゴ(クローン)をキャッチ!', 'Use the arrow keys to catch the falling apples!'],
    ['型付きカスタムブロックでお絵かき', 'Draw with typed custom blocks'], ['def で「自分だけのブロック」を作れます (Scratch の マイベロック 相当)', 'Create your own Scratch blocks with def'], ['できた!', 'Done!'],
    ['潜水艦さがし', 'Find the Submarine'], ['マウスで海を探して、隠れた潜水艦を見つけよう', 'Search the ocean with your mouse to find the hidden submarines'],
    ['何隻見つける? (1-5)', 'How many submarines? (1-5)'], ['見つけた! ', 'Found: '], ['全部見つけた! すごい!', 'You found them all!'],
  ];
  for (const [ja, en] of replacements) code = code.split(ja).join(en);
  return code;
}
