import { analyzeText } from '../core/api';
import type { Program, Stmt, EventDef, FuncDef } from '../core/lang/ast';

export type LessonId = 'hello' | 'move' | 'repeat' | 'variable' | 'condition' | 'custom' | 'branches' | 'arithmetic' | 'keyboard' | 'whileloop' | 'lists' | 'membership' | 'logic' | 'project';
export interface Lesson {
  id: LessonId; title: string; subtitle: string; concept: string; color: string;
  goal: string; hint: string; explanation: string; example: string; starter: string;
  check: (program: Program) => boolean;
}

function events(p: Program): EventDef[] {
  return [...(p.stage ? [p.stage] : []), ...p.sprites].flatMap(t => t.body.filter((b): b is EventDef => 'decl' in b && b.decl === 'event'));
}
function walk(body: Stmt[], predicate: (s: Stmt) => boolean): boolean {
  return body.some(s => predicate(s) || (s.type === 'if' && s.branches.some(b => walk(b.body, predicate))) || (('body' in s && Array.isArray(s.body)) && walk(s.body, predicate)));
}
function flagHas(p: Program, predicate: (s: Stmt) => boolean) { return events(p).some(e => e.hat.hat === 'flag' && walk(e.body, predicate)); }
function command(s: Stmt, name: string) { return s.type === 'exprstmt' && s.expr.type === 'call' && s.expr.callee === name ? s.expr : null; }
const common = 'stage:\n    pass\n\nsprite Cat:\n    costume costume1\n\n';

export const LESSONS: Lesson[] = [
  { id: 'hello', title: 'ことばを話そう', subtitle: 'はじめの一歩', concept: 'メッセージ', color: '#9966ff',
    goal: '「やあ！」と話すように、ことばを書きかえよう。',
    hint: '「こんにちは！」を「やあ！」に変えてみよう。コードなら、" " の中を書きかえるよ。',
    explanation: 'Scratch の「〜と言う」ブロックは、コードでは say("ことば")。カッコの中が、キャラクターの話すことばだよ。',
    example: 'say("やあ！")', starter: common + '    on flag:\n        say("こんにちは！")\n',
    check: p => flagHas(p, s => command(s, 'say')?.args[0]?.type === 'str' && (command(s, 'say')!.args[0] as {value:string}).value === 'やあ！') },
  { id: 'move', title: 'キャラを動かそう', subtitle: '数字をかえてみよう', concept: '動きと数字', color: '#4c97ff',
    goal: '旗を押したとき、30 歩動くようにしよう。',
    hint: 'コードの move(10) の 10 を 30 に変えよう。ブロックの数字も変わるよ。',
    explanation: '「10歩動かす」は move(10)。カッコの中の数字を変えると、動く歩数が変わるよ。',
    example: 'move(30)', starter: common + '    on flag:\n        move(10)\n',
    check: p => flagHas(p, s => command(s, 'move')?.args[0]?.type === 'num' && (command(s, 'move')!.args[0] as {value:number}).value === 30) },
  { id: 'repeat', title: 'くり返してみよう', subtitle: '同じことを何回も', concept: 'くり返し', color: '#ffab19',
    goal: '10 歩動く動きを、4 回くり返そう。',
    hint: 'repeat 2: の 2 を 4 に変えよう。中の move(10) はそのままだよ。',
    explanation: 'repeat のあとの数が回数。字下げされた行は、くり返しの中に入っているよ。',
    example: 'repeat 4:\n    move(10)', starter: common + '    on flag:\n        repeat 2:\n            move(10)\n',
    check: p => flagHas(p, s => s.type === 'repeat' && s.count.type === 'num' && s.count.value === 4 && walk(s.body, x => command(x, 'move')?.args[0]?.type === 'num' && (command(x, 'move')!.args[0] as {value:number}).value === 10)) },
  { id: 'variable', title: '得点をふやそう', subtitle: '数字をおぼえる箱', concept: '変数', color: '#ff8c1a',
    goal: '旗を押したとき、score を 1 ふやそう。',
    hint: 'score += 0 の 0 を 1 に変えよう。+= は「今の数字に足す」という意味だよ。',
    explanation: '変数は、数字やことばをしまう名前つきの箱。int は「整数」のこと。score += 1 で得点を 1 ふやせるよ。',
    example: 'var score: int = 0\nscore += 1', starter: 'stage:\n    var score: int = 0 @show\n\nsprite Cat:\n    costume costume1\n    on flag:\n        score += 0\n',
    check: p => flagHas(p, s => s.type === 'augassign' && s.target.name === 'score' && s.op === '+=' && s.value.type === 'num' && s.value.value === 1) },
  { id: 'condition', title: 'もしものときは？', subtitle: '条件でえらぼう', concept: '条件分岐', color: '#ffab19',
    goal: 'score が 5 より大きいとき「すごい！」と言おう。',
    hint: 'if score > 0: の 0 を 5 に変えよう。say("すごい！") は if の中に置いてね。',
    explanation: 'if は「もし」。条件が正しいときだけ、下に字下げされた命令を実行するよ。> は「より大きい」。',
    example: 'if score > 5:\n    say("すごい！")', starter: 'stage:\n    var score: int = 6 @show\n\nsprite Cat:\n    costume costume1\n    on flag:\n        if score > 0:\n            say("すごい！")\n',
    check: p => flagHas(p, s => s.type === 'if' && s.branches.some(b => b.cond?.type === 'binary' && b.cond.op === '>' && b.cond.left.type === 'name' && b.cond.left.name === 'score' && b.cond.right.type === 'num' && b.cond.right.value === 5 && walk(b.body, x => command(x, 'say')?.args[0]?.type === 'str' && (command(x, 'say')!.args[0] as {value:string}).value === 'すごい！'))) },
  { id: 'custom', title: '自分だけの命令', subtitle: 'マイブロックをつくる', concept: '関数', color: '#ff6680',
    goal: 'jump を定義して、旗を押したときに jump(20) を呼び出そう。',
    hint: '最後の jump(10) を jump(20) に変えよう。def は命令を作るところ、jump(20) は使うところだよ。',
    explanation: 'def は Scratch の「ブロック定義」のようなもの。power: int は、整数を受け取るための名前だよ。',
    example: 'def jump(power: int):\n    change_y(power)\n\non flag:\n    jump(20)', starter: common + '    def jump(power: int):\n        change_y(power)\n\n    on flag:\n        jump(10)\n',
    check: p => p.sprites.some(sprite => sprite.body.some((b): b is FuncDef => 'decl' in b && b.decl === 'def' && b.name === 'jump') && sprite.body.some(b => 'decl' in b && b.decl === 'event' && b.hat.hat === 'flag' && walk(b.body, x => command(x, 'jump')?.args[0]?.type === 'num' && (command(x, 'jump')!.args[0] as {value:number}).value === 20))) },
];

// The second half asks learners to combine concepts, not just change a value.
const scoreStage = 'stage:\n    var score: int = 0 @show\n\nsprite Cat:\n    costume costume1\n    on flag:\n';
function says(s: Stmt, value: string) { const c=command(s,'say'); return c?.args[0]?.type==='str' && c.args[0].value===value; }
function plus(s: Stmt, name: string, n: number) { return s.type==='augassign' && s.op==='+=' && s.target.name===name && s.value.type==='num' && s.value.value===n; }
LESSONS.push(
  { id:'branches',title:'どちらの道へ？',subtitle:'if と else',concept:'2つの分岐',color:'#ffab19',
    goal:'score が 10 以上なら「CLEAR」、それ以外なら「TRY」と言おう。',
    hint:'else: の下に字下げして say("TRY") を書こう。pass は消してね。',
    explanation:'if は条件が正しいとき、else はそれ以外のとき。どちらか一方の道を通るよ。',example:'if score >= 10:\n    say("CLEAR")\nelse:\n    say("TRY")',
    starter:scoreStage+'        if score >= 10:\n            say("CLEAR")\n        else:\n            pass\n',
    check:p=>flagHas(p,s=>s.type==='if' && s.branches.some(b=>b.cond?.type==='binary'&&b.cond.op==='>='&&b.cond.left.type==='name'&&b.cond.left.name==='score'&&b.cond.right.type==='num'&&b.cond.right.value===10&&walk(b.body,x=>says(x,'CLEAR'))) && s.branches.some(b=>!b.cond&&walk(b.body,x=>says(x,'TRY')))) },
  { id:'arithmetic',title:'計算のじゅんばん',subtitle:'式と演算子',concept:'四則演算',color:'#59c059',
    goal:'score に「今の score + 5 × 2」を代入しよう。',hint:'score = score + 5 * 2 と書くよ。* はかけ算で、+ より先に計算されるよ。',
    explanation:'式は値を計算するレシピ。* や / は、+ や - より先に計算されるよ。カッコも使えるよ。',example:'score = score + 5 * 2',
    starter:scoreStage+'        score = score + 1\n',
    check:p=>flagHas(p,s=>s.type==='assign'&&s.target.type==='name'&&s.target.name==='score'&&s.value.type==='binary'&&s.value.op==='+'&&s.value.left.type==='name'&&s.value.left.name==='score'&&s.value.right.type==='binary'&&s.value.right.op==='*'&&s.value.right.left.type==='num'&&s.value.right.left.value===5&&s.value.right.right.type==='num'&&s.value.right.right.value===2) },
  { id:'keyboard',title:'キーでうごかそう',subtitle:'イベントと順番',concept:'キーボードイベント',color:'#4c97ff',
    goal:'スペースキーが押されたら、10 歩動き、そのあと右に 15 度回ろう。',hint:'move(10) の次の行に、同じ字下げで turn_right(15) を追加しよう。',
    explanation:'on key はキーが押されたときの入り口。中の命令は上から順番に動くよ。',example:'on key "space":\n    move(10)\n    turn_right(15)',
    starter:common+'    on key "space":\n        move(10)\n',
    check:p=>events(p).some(e=>e.hat.hat==='key'&&e.hat.key.type==='str'&&e.hat.key.value==='space'&&e.body.some((s,i)=>command(s,'move')?.args[0]?.type==='num'&&(command(s,'move')!.args[0] as {value:number}).value===10&&e.body.slice(i+1).some(x=>command(x,'turn_right')?.args[0]?.type==='num'&&(command(x,'turn_right')!.args[0] as {value:number}).value===15))) },
  { id:'whileloop',title:'条件でくり返そう',subtitle:'while と終了条件',concept:'while',color:'#ffab19',
    goal:'score が 5 未満の間、score を 2 ずつ増やそう。',hint:'while score < 3: を while score < 5: に、score += 1 を score += 2 に変えよう。',
    explanation:'while は条件が正しい間くり返すよ。条件を変える処理がないと、いつまでも終わらないことがあるよ。',example:'while score < 5:\n    score += 2',
    starter:scoreStage+'        while score < 3:\n            score += 1\n',
    check:p=>flagHas(p,s=>s.type==='while'&&s.cond.type==='binary'&&s.cond.op==='<'&&s.cond.left.type==='name'&&s.cond.left.name==='score'&&s.cond.right.type==='num'&&s.cond.right.value===5&&walk(s.body,x=>plus(x,'score',2))) },
  { id:'lists',title:'リストに集めよう',subtitle:'複数のデータを記録',concept:'リストの追加',color:'#ff661a',
    goal:'旗を押したら、items に apple、次に banana を追加しよう。',hint:'items.add("apple") の次に items.add("banana") を同じ字下げで書こう。',
    explanation:'リストは複数の値を順番にしまう箱。ScratchPy の add は最後に値を追加するよ。',example:'list items: list[str] = []\nitems.add("apple")\nitems.add("banana")',
    starter:'stage:\n    list items: list[str] = [] @show\n\nsprite Cat:\n    costume costume1\n    on flag:\n        items.add("apple")\n',
    check:p=>events(p).some(e=>e.hat.hat==='flag'&&e.body.some((s,i)=>s.type==='listmethod'&&s.list.name==='items'&&s.method==='add'&&s.args[0]?.type==='str'&&s.args[0].value==='apple'&&e.body.slice(i+1).some(x=>x.type==='listmethod'&&x.list.name==='items'&&x.method==='add'&&x.args[0]?.type==='str'&&x.args[0].value==='banana'))) },
  { id:'membership',title:'リストを調べよう',subtitle:'in と条件分岐',concept:'要素の検索',color:'#ff661a',
    goal:'items に banana が入っていたら「YES」、なければ「NO」と言おう。',hint:'if "apple" in items: の apple を banana に変えよう。else はそのまま。',
    explanation:'in はリストに値があるかを調べるよ。if と組み合わせると、結果によって動きを分けられるよ。',example:'if "banana" in items:\n    say("YES")\nelse:\n    say("NO")',
    starter:'stage:\n    list items: list[str] = ["banana"]\n\nsprite Cat:\n    costume costume1\n    on flag:\n        if "apple" in items:\n            say("YES")\n        else:\n            say("NO")\n',
    check:p=>flagHas(p,s=>s.type==='if'&&s.branches.some(b=>b.cond?.type==='binary'&&b.cond.op==='in'&&b.cond.left.type==='str'&&b.cond.left.value==='banana'&&b.cond.right.type==='name'&&b.cond.right.name==='items'&&walk(b.body,x=>says(x,'YES')))&&s.branches.some(b=>!b.cond&&walk(b.body,x=>says(x,'NO')))) },
  { id:'logic',title:'条件を組み合わせよう',subtitle:'and と比較',concept:'論理演算',color:'#59c059',
    goal:'score が 10 以上、かつ lives が 0 より大きいとき「GO」と言おう。',hint:'if score >= 10 and lives > 0: のように、2つの条件を and でつなごう。',
    explanation:'and は両方の条件が正しいときだけ正しいよ。or はどちらか一方が正しければ正しいよ。',example:'if score >= 10 and lives > 0:\n    say("GO")',
    starter:'stage:\n    var score: int = 10\n    var lives: int = 3\n\nsprite Cat:\n    costume costume1\n    on flag:\n        if score >= 10:\n            say("GO")\n',
    check:p=>flagHas(p,s=>s.type==='if'&&s.branches.some(b=>{const c=b.cond;return c?.type==='binary'&&c.op==='and'&&c.left.type==='binary'&&c.left.op==='>='&&c.left.left.type==='name'&&c.left.left.name==='score'&&c.left.right.type==='num'&&c.left.right.value===10&&c.right.type==='binary'&&c.right.op==='>'&&c.right.left.type==='name'&&c.right.left.name==='lives'&&c.right.right.type==='num'&&c.right.right.value===0&&walk(b.body,x=>says(x,'GO'));})) },
  { id:'project',title:'仕上げのチャレンジ',subtitle:'くり返しと条件を組み合わせる',concept:'総合演習',color:'#ff6680',
    goal:'score を 0 に戻し、3 回くり返して 2 ずつ増やそう。その後、6 以上なら CLEAR、それ以外は TRY と言おう。',
    hint:'repeat 2: を repeat 3: に、score += 1 を score += 2 に。if / else と score = 0 は残してね。',
    explanation:'初期化 → くり返し → 判定の順に組み立てると、プログラムの流れが読みやすくなるよ。',example:'score = 0\nrepeat 3:\n    score += 2\nif score >= 6:\n    say("CLEAR")\nelse:\n    say("TRY")',
    starter:scoreStage+'        score = 0\n        repeat 2:\n            score += 1\n        if score >= 6:\n            say("CLEAR")\n        else:\n            say("TRY")\n',
    check:p=>events(p).some(e=>e.hat.hat==='flag'&&e.body.some((s,i)=>s.type==='assign'&&s.target.type==='name'&&s.target.name==='score'&&s.value.type==='num'&&s.value.value===0&&e.body.slice(i+1).some((r,j)=>r.type==='repeat'&&r.count.type==='num'&&r.count.value===3&&walk(r.body,x=>plus(x,'score',2))&&e.body.slice(i+j+2).some(x=>x.type==='if'&&x.branches.some(b=>b.cond?.type==='binary'&&b.cond.op==='>='&&b.cond.left.type==='name'&&b.cond.left.name==='score'&&b.cond.right.type==='num'&&b.cond.right.value===6&&walk(b.body,y=>says(y,'CLEAR')))&&x.branches.some(b=>!b.cond&&walk(b.body,y=>says(y,'TRY'))))))) }
);

export function checkLesson(lesson: Lesson, text: string): { ok: boolean; message: string } {
  const a = analyzeText(text);
  const error = a.diagnostics.find(d => d.severity === 'error');
  if (error || !a.program) return {ok:false, message: error ? `まずはコードを直そう：${error.message}` : 'コードを読み取れなかったよ。'};
  return lesson.check(a.program) ? {ok:true, message:'ミッションクリア！ できたね！'} : {ok:false, message:'おしい！ ミッションをもう一度読んで、数字やことばをたしかめてみよう。'};
}

/** English lessons have their own literals and tests, so the tasks read naturally. */
export const EN_LESSONS: Lesson[] = [
  { ...LESSONS[0], title:'Make your sprite talk', subtitle:'Your first step', concept:'Messages',
    goal:'Change the words so your sprite says “Hi!”.', hint:'Change “Hello!” to “Hi!” between the quotation marks.',
    explanation:'The Scratch “say” block becomes say("words") in code. The text inside the parentheses is what your sprite says.',
    example:'say("Hi!")', starter: LESSONS[0].starter.replace('こんにちは！','Hello!'),
    check: p => flagHas(p, s => command(s, 'say')?.args[0]?.type === 'str' && (command(s, 'say')!.args[0] as {value:string}).value === 'Hi!') },
  { ...LESSONS[1], title:'Move your sprite', subtitle:'Change a number', concept:'Motion and numbers',
    goal:'Make your sprite move 30 steps when the flag is clicked.', hint:'Change the 10 in move(10) to 30.',
    explanation:'The “move 10 steps” block is move(10). Change the number in parentheses to change how far the sprite moves.' },
  { ...LESSONS[2], title:'Try a loop', subtitle:'Do it again', concept:'Loops',
    goal:'Repeat the movement of 10 steps 4 times.', hint:'Change the 2 in repeat 2: to 4. Leave move(10) inside the loop.',
    explanation:'The number after repeat is the number of times. Indented lines are inside the loop.' },
  { ...LESSONS[3], title:'Increase your score', subtitle:'A box for numbers', concept:'Variables',
    goal:'Increase score by 1 when the flag is clicked.', hint:'Change score += 0 to score += 1. += means “add to the current value”.',
    explanation:'A variable is a named box for a value. int means a whole number. score += 1 adds 1 to the score.' },
  { ...LESSONS[4], title:'What if?', subtitle:'Make a choice', concept:'Conditions',
    goal:'Say “Amazing!” when score is greater than 5.', hint:'Change the 0 in if score > 0: to 5. Keep say("Amazing!") inside the if.',
    explanation:'if means “only when”. The indented commands run only when the condition is true. > means “greater than”.',
    example:'if score > 5:\n    say("Amazing!")', starter: LESSONS[4].starter.replace('すごい！','Amazing!'),
    check: p => flagHas(p, s => s.type === 'if' && s.branches.some(b => b.cond?.type === 'binary' && b.cond.op === '>' && b.cond.left.type === 'name' && b.cond.left.name === 'score' && b.cond.right.type === 'num' && b.cond.right.value === 5 && walk(b.body, x => command(x, 'say')?.args[0]?.type === 'str' && (command(x, 'say')!.args[0] as {value:string}).value === 'Amazing!'))) },
  { ...LESSONS[5], title:'Make your own command', subtitle:'Create a custom block', concept:'Functions',
    goal:'Define jump and call jump(20) when the flag is clicked.', hint:'Change the last jump(10) to jump(20). def creates the command; jump(20) uses it.',
    explanation:'def is like Scratch’s “define block”. power: int names an input that accepts a whole number.' },
  { ...LESSONS[6], title:'Choose a path',subtitle:'if and else',concept:'Two branches',goal:'If score is at least 10, say “CLEAR”; otherwise say “TRY”.',hint:'Replace pass with say("TRY"), indented under else:.',explanation:'if runs when the condition is true; else runs otherwise. Only one branch runs.' },
  { ...LESSONS[7], title:'Order of operations',subtitle:'Expressions and operators',concept:'Arithmetic',goal:'Assign the current score + 5 × 2 to score.',hint:'Write score = score + 5 * 2. Multiplication happens before addition.',explanation:'An expression calculates a value. * and / are evaluated before + and -. Parentheses can change the order.' },
  { ...LESSONS[8], title:'Control with a key',subtitle:'Events and order',concept:'Key events',goal:'When space is pressed, move 10 steps, then turn right 15 degrees.',hint:'Add turn_right(15) on the next line, at the same indentation as move(10).',explanation:'on key starts when a key is pressed. Commands inside run from top to bottom.' },
  { ...LESSONS[9], title:'Repeat while true',subtitle:'while and stopping',concept:'while loops',goal:'While score is less than 5, increase score by 2.',hint:'Change the condition to score < 5 and the increment to score += 2.',explanation:'while repeats as long as its condition is true. If nothing changes the condition, the loop might never end.' },
  { ...LESSONS[10], title:'Collect in a list',subtitle:'Store multiple values',concept:'Adding to lists',goal:'When the flag is clicked, add apple and then banana to items.',hint:'Add items.add("banana") after items.add("apple"), with the same indentation.',explanation:'A list holds several values in order. ScratchPy’s add puts a value at the end.' },
  { ...LESSONS[11], title:'Search a list',subtitle:'in and conditions',concept:'Membership',goal:'Say “YES” if items contains banana; otherwise say “NO”.',hint:'Change apple to banana in the if condition. Keep the else branch.',explanation:'in checks whether a value is in a list. Combine it with if to choose what happens next.' },
  { ...LESSONS[12], title:'Combine conditions',subtitle:'and and comparisons',concept:'Boolean logic',goal:'Say “GO” when score is at least 10 and lives is greater than 0.',hint:'Join the two conditions: if score >= 10 and lives > 0:',explanation:'and is true only when both conditions are true. or is true when at least one is true.' },
  { ...LESSONS[13], title:'Final challenge',subtitle:'Combine loops and decisions',concept:'Putting it together',goal:'Reset score to 0, add 2 three times, then say CLEAR if score is at least 6, or TRY otherwise.',hint:'Change repeat 2 to repeat 3 and score += 1 to score += 2. Keep the reset and if / else.',explanation:'Initialize, repeat, then decide. Organizing the steps makes a program easier to follow.' },
];
