export default {
  id: "s029",
  pack: "permissions-newbie",
  title: "社員情報ファイルの閲覧制限",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "権限",
  requester: { name: "田中さん", role: "人事部", avatar: "👩" },
  request: [
    "社員情報のファイルが誰でも見られる状態になっていました。",
    "社内ルールでは担当者（このファイルの所有者）だけが見られるようにしたいです。employee.txt をお願いします。",
  ],
  initialEnv: {
    files: [
      { path: "~/employee.txt", content: "氏名,部署,給与\n田中,人事部,非公開\n佐藤,開発部,非公開\n", mode: "644" },
    ],
  },
  steps: [
    {
      id: "chmod-600",
      label: "employee.txt を所有者以外アクセスできないようにする（600）",
      hint: [
        "権限を変更するコマンドを使います。",
        "chmod コマンドを使います。",
        "「所有者だけ読み書きできる」＝8進数なら chmod 600 employee.txt です。",
      ],
      goal: { type: "octal", path: "~/employee.txt", value: "600" },
    },
  ],
  clearComment: "ありがとう！これで担当者以外は見られなくなりましたね。",
  explanation: {
    why: "ファイルの権限は所有者(u)・グループ(g)・その他(o)の3つのクラスごとに設定します。「担当者（所有者）だけが見られる」状態にするには、グループとその他の権限をすべて外し、所有者にだけ読み書き権限を残します。数値で言うと 6(rw-) 0(---) 0(---) ＝ 600 がこれにあたります。個人情報や給与情報のような機微なファイルは、この600（または読み取り専用にするなら400）で管理するのがLinuxの基本作法です。",
    alternatives: "chmod 600 employee.txt（8進数）と chmod go-rwx employee.txt / chmod go= employee.txt（シンボリック・グループとその他の権限をすべて外す）は、どちらも最終的に同じ rw------- という権限になります。すでにグループ/その他に何らかの権限が付いていても、go= やgo-rwx なら残っている権限もまとめて外せるので実務では扱いやすい書き方です。",
    lpic: "LPIC Level1では「rw-------」のような9文字のパーミッション表記と、それに対応する8進数（この例では600）を相互に変換できるかがよく問われます。600・700・644・755あたりは特に頻出なので、rwxの並びと4(r)+2(w)+1(x)の計算を反射的にできるようにしておくと得点源になります。",
  },
};
