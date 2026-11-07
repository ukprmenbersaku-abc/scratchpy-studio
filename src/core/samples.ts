/**
 * UI に内蔵するサンプル ScratchPy プログラム
 */

export interface Sample {
  id: string;
  title: string;
  description: string;
  code: string;
}

export const SAMPLES: Sample[] = [
  {
    id: 'hello',
    title: 'こんにちは ScratchPy!',
    description: '基本: イベント・せりふ・動き・変数',
    code: `# こんにちは ScratchPy!
# 最初の一歩: 旗クリックで動き回って、クリックで得点!

stage:
    var score: int = 0 @show

sprite Cat:
    x: 0
    y: 0
    direction: 90
    costume costume1
    sound Meow

    on flag:
        show()
        say("こんにちは、ScratchPy!")
        wait(2)
        forever:
            move(10)
            if touching("edge"):
                bounce()
            wait(0.1)

    on click:
        play_sound("Meow")
        score += 1
        say(join("クリック数: ", score), 1)
        change_size(5)
        if score >= 10:
            say("すごい! 10回クリック!", 2)
            set_size(100)
            score = 0
`,
  },
  {
    id: 'game',
    title: 'リンゴキャッチゲーム',
    description: '変数・リスト・乱数・クローン・メッセージ',
    code: `# リンゴキャッチゲーム
# ←→ キーでネコを動かして、落ちてくるリンゴ(クローン)をキャッチ!

stage:
    var score: int = 0 @show
    var lives: int = 3 @show(large)
    list caught: list[str] = []
    costume backdrop1

    on flag:
        broadcast("new game")

    on receive "game over":
        switch_backdrop("backdrop1")

sprite Cat:
    x: 0
    y: -140
    var speed: int = 8

    costume costume1
    sound Meow

    on receive "new game":
        score = 0
        lives = 3
        caught.clear()
        set_x(0)
        show()
        forever:
            if key_pressed("left arrow"):
                change_x(-speed)
            if key_pressed("right arrow"):
                change_x(speed)
            set_y(-140)

    on flag:
        forever:
            wait(random(1, 2))
            if lives > 0:
                create_clone("Apple")

sprite Apple:
    y: 170
    costume costume1

    on clone:
        set_x(random(-230, 230))
        show()
        repeat 100:
            change_y(-4)
            if touching("Cat"):
                score += 1
                caught.add(join("apple#", score))
                play_sound("Meow")
                delete_clone()
            if y < -170:
                lives -= 1
                if lives <= 0:
                    broadcast("game over")
                delete_clone()
        delete_clone()
`,
  },
  {
    id: 'procs',
    title: 'カスタムブロック (型付き)',
    description: 'def による独自ブロック・@warp・ペン拡張',
    code: `# 型付きカスタムブロックでお絵かき
# def で「自分だけのブロック」を作れます (Scratch の マイベロック 相当)

sprite Artist:
    x: 0
    y: 0
    costume costume1

    def polygon(sides: int, length: float):
        repeat sides:
            move(length)
            turn_right(360 / sides)

    @warp
    def flower(petals: int, length: float):
        repeat petals:
            polygon(3, length)
            turn_right(360 / petals)

    on flag:
        clear_pen()
        pen_down()
        set_pen_color("#ff8c1a")
        set_pen_size(2)
        flower(6, 40)
        pen_up()
        say("できた!")

    on key "space":
        change_pen_param("color", random(1, 100))
        goto("random")
        pen_down()
        polygon(random(3, 8), 50)
        pen_up()
`,
  },
  {
    id: 'chat',
    title: '潜水艦さがし (条件とリスト)',
    description: 'while・in 演算子・list・sensing',
    code: `# 潜水艦さがし
# マウスで海を探して、隠れた潜水艦を見つけよう

stage:
    var found: int = 0 @show
    list found_names: list[str] = [] @show
    costume backdrop1

    on flag:
        ask("何隻見つける? (1-5)")
        broadcast("start")

sprite Submarine:
    visible: false
    var target_count: int = 3
    var my_name: str = "sub"

    costume costume1
    sound Meow

    on receive "start":
        found = 0
        found_names.clear()
        target_count = random(1, 5)
        repeat target_count:
            create_clone()

    on clone:
        goto("random")
        show()
        my_name = join("sub-", random(100, 999))
        while not touching("mouse"):
            wait(0.1)
        play_sound("Meow")
        found += 1
        if my_name in found_names:
            pass
        else:
            found_names.add(my_name)
        say(join("見つけた! ", my_name), 1)
        hide()
        delete_clone()
        if found >= target_count:
            broadcast("all found")

    on receive "all found":
        say("全部見つけた! すごい!", 2)
`,
  },
];
