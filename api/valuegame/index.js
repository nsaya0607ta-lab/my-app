/* =========================================================================
   価値観ゲーム（オンライン対戦）のAPIの入口（1つのサーバーレス関数にまとめたもの）

   Vercelは api/ 直下の .js を1ファイル＝1サーバーレス関数として数え、
   Hobbyプランでは1デプロイあたり12個までという上限がある。以前は
   deal / reveal / reward をそれぞれ別ファイル（＝別関数）にしていたが、
   関数の数が上限を超えて本番デプロイが失敗するようになったため、
   この入口1つに統合した。

   ・実際の処理は今までどおり _deal.js / _reveal.js / _reward.js が持つ。
     ファイル名を "_" で始めると、Vercelはそれを関数として数えない。
   ・呼び出しは ?action=deal|reveal|reward で振り分ける。メソッド（POST）・
     リクエストボディ・認証（Firebase IDトークン）の扱いは今までと同じで、
     数字の生成・暗号化・BPの付与額の判定はすべてサーバー側のまま。

   例）POST /api/valuegame?action=deal
       POST /api/valuegame?action=reveal
       POST /api/valuegame?action=reward
   ========================================================================= */
const deal = require("./_deal");
const reveal = require("./_reveal");
const reward = require("./_reward");

const HANDLERS = { deal, reveal, reward };

module.exports = async (req, res) => {
  const action = typeof req.query.action === "string" ? req.query.action : "";
  const handler = HANDLERS[action];
  if(!handler){
    res.status(400).json({ error: "invalid-action", message: "action は deal / reveal / reward のいずれかを指定してください。" });
    return;
  }
  return handler(req, res);
};
