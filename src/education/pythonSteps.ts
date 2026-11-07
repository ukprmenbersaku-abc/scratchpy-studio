import type { LessonId } from './lessons';

export interface PythonStep { title:string; description:string; code:string; question:string; options:string[]; answer:number; explanation:string }
type StepPair = {ja:PythonStep; en:PythonStep};
const pair=(ja:PythonStep,en:PythonStep):StepPair=>({ja,en});
/** Python-only reading and reasoning exercises. These examples are not executed in ScratchPy. */
export const PYTHON_STEPS: Partial<Record<LessonId,StepPair>> = {
branches:pair(
{title:'elif で3つ以上に分ける',description:'Python の elif は、前の条件が偽だったときに次の条件を調べます。上から順に判定し、最初に当てはまった分岐だけを実行します。',code:'score = 80\nif score >= 90:\n    grade = "A"\nelif score >= 70:\n    grade = "B"\nelse:\n    grade = "C"\nprint(grade)',question:'この Python コードの表示は？',options:['A','B','C'],answer:1,explanation:'80 は 90 以上ではありませんが 70 以上なので、elif の B が選ばれます。'},
{title:'Three or more branches with elif',description:'Python tests elif only if earlier conditions are false. It runs the first matching branch.',code:'score = 80\nif score >= 90:\n    grade = "A"\nelif score >= 70:\n    grade = "B"\nelse:\n    grade = "C"\nprint(grade)',question:'What does this Python code print?',options:['A','B','C'],answer:1,explanation:'80 is not at least 90, but it is at least 70, so the elif branch selects B.'}),
arithmetic:pair(
{title:'商と余りを求める',description:'Python の // は切り捨て除算、% は余りです。回数の分配や偶数・奇数の判定にも使えます。',code:'print(11 // 3, 11 % 3)',question:'表示される2つの数は？',options:['3 2','3 3','4 2'],answer:0,explanation:'11 を 3 で割ると、切り捨てた商は 3、余りは 2 です。'},
{title:'Quotient and remainder',description:'In Python, // is floor division and % is remainder. These are useful for dividing groups or testing parity.',code:'print(11 // 3, 11 % 3)',question:'Which two numbers are printed?',options:['3 2','3 3','4 2'],answer:0,explanation:'11 divided by 3 has a floor quotient of 3 and a remainder of 2.'}),
keyboard:pair(
{title:'番号と値を同時に取り出す',description:'Python の enumerate は、順番と要素をセットで取り出します。start=1 を指定すると番号は1から始まります。',code:'actions = ["move", "turn"]\nfor number, action in enumerate(actions, start=1):\n    print(number, action)',question:'最初の行には何が表示される？',options:['0 move','1 move','1 turn'],answer:1,explanation:'start=1 なので最初の番号は 1。最初の要素は move です。'},
{title:'Iterate with a counter',description:'Python enumerate yields both a counter and each item. start=1 makes the counter begin at one.',code:'actions = ["move", "turn"]\nfor number, action in enumerate(actions, start=1):\n    print(number, action)',question:'What is printed on the first line?',options:['0 move','1 move','1 turn'],answer:1,explanation:'The counter starts at 1 and the first item is move.'}),
whileloop:pair(
{title:'break でループを抜ける',description:'Python の break は、条件式がまだ真でも、そのループをすぐに終了します。',code:'n = 0\nwhile n < 5:\n    n += 1\n    if n == 3:\n        break\nprint(n)',question:'最後に表示される n は？',options:['2','3','5'],answer:1,explanation:'n が 3 になった時点で break が実行され、ループの外に進みます。'},
{title:'Exit a loop with break',description:'Python break immediately exits the loop, even if its condition is still true.',code:'n = 0\nwhile n < 5:\n    n += 1\n    if n == 3:\n        break\nprint(n)',question:'What is the final value of n?',options:['2','3','5'],answer:1,explanation:'Once n reaches 3, break exits the loop.'}),
lists:pair(
{title:'リスト内包表記',description:'Python のリスト内包表記は、くり返しと条件で新しいリストを作る書き方です。元の range を順に調べます。',code:'squares = [x * x for x in range(4) if x % 2 == 0]\nprint(squares)',question:'表示されるリストは？',options:['[0, 4]','[1, 9]','[0, 1, 4, 9]'],answer:0,explanation:'range(4) は 0, 1, 2, 3。偶数の 0 と 2 の二乗が残ります。'},
{title:'List comprehensions',description:'A Python list comprehension creates a new list using iteration and an optional condition.',code:'squares = [x * x for x in range(4) if x % 2 == 0]\nprint(squares)',question:'Which list is printed?',options:['[0, 4]','[1, 9]','[0, 1, 4, 9]'],answer:0,explanation:'range(4) gives 0, 1, 2, 3. Only the even values 0 and 2 are squared.'}),
membership:pair(
{title:'辞書と get',description:'Python の辞書はキーと値を組にして保存します。get(キー, 既定値) はキーがないときに既定値を返します。',code:'stock = {"apple": 2, "pear": 1}\nprint(stock.get("kiwi", 0))',question:'表示される値は？',options:['0','1','KeyError'],answer:0,explanation:'kiwi は辞書にないため、get の第2引数で指定した 0 が返ります。'},
{title:'Dictionaries and get',description:'Python dictionaries map keys to values. get(key, default) returns the default when the key is missing.',code:'stock = {"apple": 2, "pear": 1}\nprint(stock.get("kiwi", 0))',question:'What is printed?',options:['0','1','KeyError'],answer:0,explanation:'kiwi is absent, so get returns its default value, 0.'}),
logic:pair(
{title:'短絡評価を知ろう',description:'Python の and は、左側が偽なら右側を評価しません。安全な条件を先に置くと、不要な計算を避けられます。',code:'n = 0\nresult = n != 0 and 10 / n > 2\nprint(result)',question:'この Python コードはどうなる？',options:['False と表示する','True と表示する','ゼロ除算エラーになる'],answer:0,explanation:'n != 0 が False なので、10 / n は評価されず False が表示されます。'},
{title:'Short-circuit evaluation',description:'Python and does not evaluate its right side when the left side is false. A safety check can avoid unnecessary evaluation.',code:'n = 0\nresult = n != 0 and 10 / n > 2\nprint(result)',question:'What happens in Python?',options:['It prints False','It prints True','It raises a division-by-zero error'],answer:0,explanation:'n != 0 is False, so 10 / n is never evaluated and False is printed.'}),
project:pair(
{title:'関数・リスト・条件を組み合わせる',description:'Python の関数は return で結果を返せます。内包表記で条件に合う語だけ集め、len で個数を数えましょう。',code:'def count_long(words, min_len):\n    matches = [word for word in words if len(word) >= min_len]\n    return len(matches)\n\nprint(count_long(["cat", "elephant", "fox"], 4))',question:'表示される個数は？',options:['0','1','3'],answer:1,explanation:'4文字以上なのは elephant だけなので、1 が返ります。'},
{title:'Combine functions, lists and conditions',description:'Python functions can return a result. Use a comprehension to select matching words and len to count them.',code:'def count_long(words, min_len):\n    matches = [word for word in words if len(word) >= min_len]\n    return len(matches)\n\nprint(count_long(["cat", "elephant", "fox"], 4))',question:'What count is printed?',options:['0','1','3'],answer:1,explanation:'Only elephant has at least four characters, so the function returns 1.'})
};
