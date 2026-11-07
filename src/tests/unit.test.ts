/**
 * ユニットテスト: MD5 / レキサ / パーサ / 型チェッカ
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { md5Bytes } from '../core/sb3/md5';
import { tokenize, LexError } from '../core/lang/lexer';
import { parse } from '../core/lang/parser';
import { check } from '../core/lang/typechecker';
import { ParseError } from '../core/lang/parser';

const nodeMd5 = (b: Uint8Array) => createHash('md5').update(b).digest('hex');

describe('md5Bytes (純TS実装 vs node:crypto)', () => {
  const cases: [string, string][] = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['The quick brown fox jumps over the lazy dog', '9e107d9d372bb6826bd81d3542a419d6'],
  ];
  for (const [input, expected] of cases) {
    it(`RFC テストベクトル: "${input.slice(0, 30)}"`, () => {
      const bytes = new TextEncoder().encode(input);
      expect(md5Bytes(bytes)).toBe(expected);
    });
  }
  it('node:crypto と 100 件のランダム一致', () => {
    for (let i = 0; i < 100; i++) {
      const len = Math.floor(Math.random() * 300);
      const bytes = new Uint8Array(len);
      for (let j = 0; j < len; j++) bytes[j] = Math.floor(Math.random() * 256);
      expect(md5Bytes(bytes)).toBe(nodeMd5(bytes));
    }
  });
});

describe('レキサ: インデント/デデント', () => {
  it('INDENT と DEDENT が正しく発行される', () => {
    const toks = tokenize('stage:\n    var a: int = 1\nsprite Cat:\n    pass\n');
    const kinds = toks.map(t => t.kind);
    expect(kinds.filter(k => k === 'indent').length).toBe(2);
    expect(kinds.filter(k => k === 'dedent').length).toBe(2);
    // dedent は EOF 直前でまとめて
    const lastDedents = kinds.slice(kinds.lastIndexOf('dedent') - 1);
    expect(lastDedents).toContain('eof');
  });

  it('コメントのみの行はインデント構造に影響しない', () => {
    const toks = tokenize('stage:\n    # コメント\n    var a: int = 1\n', true);
    const kinds = toks.map(t => t.kind);
    expect(kinds.filter(k => k === 'indent').length).toBe(1);
    expect(kinds.filter(k => k === 'comment').length).toBe(1);
  });

  it('行末コメントは値を保つ', () => {
    const toks = tokenize('stage:\n    pass  # 末尾コメント\n', true);
    const c = toks.find(t => t.kind === 'comment');
    expect(c?.value.trim()).toBe('末尾コメント');
  });

  it('行末の : が punct になる (旧バグの回帰テスト)', () => {
    const toks = tokenize('stage:\n    pass\n');
    const colon = toks.find(t => t.raw === ':');
    expect(colon?.kind).toBe('punct');
  });

  it('不一致インデントはエラー', () => {
    // 6→2 と戻った 2 がどのレベルとも一致しない
    expect(() => tokenize('stage:\n    pass\n      var a: int = 1\n  var b: int = 2\n')).toThrow(LexError);
  });

  it('括弧内では改行を跨げる', () => {
    const toks = tokenize('stage:\n    on flag:\n        say(join("a",\n                 "b"))\n');
    expect(toks.filter(t => t.kind === 'newline').length).toBeGreaterThanOrEqual(2);
    expect(() => parse('stage:\n    on flag:\n        say(join("a",\n                 "b"))\n')).not.toThrow();
  });

  it('2文字演算子 ==, !=, <=, >=, +=, -=', () => {
    const toks = tokenize('a == b != c <= d >= e += f -= g');
    const ops = toks.filter(t => t.kind === 'op').map(t => t.value);
    expect(ops).toEqual(['==', '!=', '<=', '>=', '+=', '-=']);
  });
});

describe('パーサ: エラー', () => {
  const bad: [string, string, RegExp][] = [
    ['トップレベルに stage/sprite 以外', 'var a: int = 1\n', /トップレベル/],
    ['コロン忘れ', 'stage\n    pass\n', /:/],
    ['インデントなしブロック', 'stage:\npass\n', /インデント/],
    ['型なし var', 'stage:\n    var a = 1\n', /必要|型/],
    ['閉じ括弧なし', 'stage:\n    on flag:\n        say("a"\n', /括弧|\)/],
  ];
  for (const [name, src, re] of bad) {
    it(name, () => {
      expect(() => parse(src)).toThrow(re);
    });
  }

  it('ParseError は行・列を持つ', () => {
    try {
      parse('stage:\n    var a = 1\n');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).line).toBe(2);
    }
  });

  it('完全なプログラムがパースできる', () => {
    const p = parse(`stage:
    var score: int = 0 @show(slider, 0, 100)
    list items: list[str] = [] @show
    costume backdrop1

sprite Cat:
    costume costume1

    @warp
    def setup(name: str, ready: bool):
        say(name)

    on flag:
        setup("go", true)
        repeat 10:
            score += 1
        while score < 100:
            wait(0.5)
        if score == 100:
            broadcast("done")
        elif score > 50:
            pass
        else:
            hide()
        forever:
            items.add("x")
`);
    expect(p.stage).toBeTruthy();
    expect(p.sprites.length).toBe(1);
  });
});

describe('型チェッカ: 負例', () => {
  const errs = (src: string) => check(parse(src)).diagnostics.filter(d => d.severity === 'error').map(d => d.message);

  it('str + int はエラー', () => {
    expect(errs('stage:\n    var a: str = "x" + 1\n').length).toBeGreaterThan(0);
  });

  it('bool を数値に代入できない', () => {
    expect(errs('stage:\n    var a: int = true\n').length).toBeGreaterThan(0);
  });

  it('未宣言の変数はエラー', () => {
    expect(errs('sprite Cat:\n    on flag:\n        x = 1\n').join('\n')).toMatch(/x|宣言/);
  });

  it('list を値として直接使用できない', () => {
    expect(errs('stage:\n    list a: list[int] = []\nsprite Cat:\n    on flag:\n        say(a)\n').length).toBeGreaterThan(0);
  });

  it('in の右辺にリスト名は使える(誤検出しない)', () => {
    expect(errs('stage:\n    list a: list[str] = ["x"]\nsprite Cat:\n    on flag:\n        if "x" in a:\n            pass\n')).toEqual([]);
  });

  it('index アクセスはリスト名を直接使える', () => {
    expect(errs('stage:\n    list a: list[str] = ["x"]\nsprite Cat:\n    on flag:\n        say(a[1])\n')).toEqual([]);
  });

  it('int → float の広げはOK', () => {
    expect(errs('stage:\n    var a: float = 3\n')).toEqual([]);
  });

  it('/ の結果は float', () => {
    expect(errs('stage:\n    var a: int = 4 / 2\n').length).toBeGreaterThan(0);
  });

  it('cloud 変数は数値のみ', () => {
    expect(errs('stage:\n    var a: str = "x" @cloud\n').length).toBeGreaterThan(0);
  });

  it('予約名 size は変数名にできない', () => {
    expect(errs('sprite Cat:\n    var size: int = 1\n').length).toBeGreaterThan(0);
  });

  it('存在しない関数の呼び出しはエラー', () => {
    expect(errs('sprite Cat:\n    on flag:\n        foobar(1)\n').length).toBeGreaterThan(0);
  });

  it('引数の型不一致はエラー (int パラメータに str)', () => {
    expect(errs('sprite Cat:\n    def f(n: int):\n        pass\n    on flag:\n        f("a")\n').length).toBeGreaterThan(0);
  });

  it('str パラメータには int/float/bool も渡せる', () => {
    expect(errs('sprite Cat:\n    def f(s: str):\n        pass\n    on flag:\n        f(1)\n        f(1.5)\n        f(true)\n')).toEqual([]);
  });

  it('プロパティは読み取り専用', () => {
    // x / size はプロパティとして解決されるので代入不可
    expect(errs('sprite Cat:\n    on flag:\n        x += 1\n').join('\n')).toMatch(/代入|\+=/);
    expect(errs('sprite Cat:\n    on flag:\n        size = 10\n').join('\n')).toMatch(/プロパティ|代入/);
  });

  it('他スプライトのプロパティ参照 Cat.x', () => {
    expect(errs('sprite Cat:\n    pass\nsprite Dog:\n    on flag:\n        say(Cat.x)\n')).toEqual([]);
  });

  it('警告: グローバル変数と同じ名前のスプライト変数', () => {
    const warns = check(parse('stage:\n    var score: int = 0\nsprite Cat:\n    var score: int = 1\n'))
      .diagnostics.filter(d => d.severity === 'warning');
    expect(warns.map(w => w.message).join('\n')).toMatch(/グローバル/);
  });
});
