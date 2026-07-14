export default {
  id: "s083",
  title: "UbuntuでWebサーバーパッケージを探せ",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "開発チームリーダー", role: "Web開発", avatar: "🌐" },
  request: [
    "【現場からの依頼】軽量なWebサーバーをUbuntuへ入れたい。候補を検索し、詳細を確認してから導入して。",
    "【使用環境】Debian系（Ubuntu Server）。",
    "【状況】正確なパッケージ名を確認するためリポジトリを検索します。候補のnginxについて情報を確認し、依存関係込みでインストールします。",
    "【問題】検索、情報確認、インストールにはそれぞれどのaptコマンドを使いますか。",
  ],
  initialEnv: {
    env:[
      {name:"PKG_SYSTEM",value:"debian"},
      {name:"PKG_INSTALLED",value:"bash=5.2.21-2ubuntu4;coreutils=9.4-3ubuntu6"},
    ],
  },
  steps: [
    { id:"search", label:"aptでWebサーバー候補を検索する", hint:["リポジトリ内をキーワード検索します。","apt search nginx を実行します。"], goal:{type:"commandRan",cmd:"apt",pattern:"search\\s+nginx"} },
    { id:"show", label:"nginxのバージョン・依存関係・説明を確認する", hint:["候補パッケージの詳細はshowです。","apt show nginx を実行します。"], goal:{type:"commandRan",cmd:"apt",pattern:"show\\s+nginx"} },
    { id:"root", label:"rootユーザーへ切り替える", hint:"インストール前にsuを実行し、パスワードにrootと入力します。", goal:{type:"becameRoot"} },
    { id:"install", label:"aptでnginxを依存関係込みでインストールする", hint:"apt install nginx を実行します。", goal:{type:"commandRan",cmd:"apt",pattern:"install\\s+(?:-y\\s+)?nginx|install\\s+nginx"} },
  ],
  clearComment: "検索、詳細確認、導入という実務的な流れで作業できたね。",
  explanation: {
    why: "【正解コマンド】apt search nginx、apt show nginx、apt install nginx。aptはリポジトリを利用するため、検索から依存関係込みの導入まで一連で行えます。手元の.debファイルを直接操作する場合はdpkgですが、今回のようなリポジトリ利用ではaptを選びます。",
    alternatives: "【注意点】検索結果には関連ライブラリや追加モジュールも含まれます。showで説明と依存関係を確認してから導入します。インストール後はサービス起動状態、待受ポート、既存Webサーバーとの競合も確認します。",
    lpic: "LPIC Level1では apt search、apt show、apt install の基本操作と、aptとdpkgの使い分けを理解します。リポジトリを使うか、ローカルファイルを直接扱うかを最初に判断しましょう。",
  },
};
