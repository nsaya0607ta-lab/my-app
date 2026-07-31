/* =========================================================================
   株価まわりのAPIの入口（1つのサーバーレス関数にまとめたもの）

   Vercelは api/ 直下の .js を1ファイル＝1サーバーレス関数として数え、
   Hobbyプランでは1デプロイあたり12個までという上限がある。以前は
   quote / search / metrics をそれぞれ別ファイル（＝別関数）にしていたが、
   関数の数が上限を超えて本番デプロイが失敗するようになったため、
   この入口1つに統合した。

   ・実際の処理は今までどおり _quote.js / _search.js / _metrics.js が持つ。
     ファイル名を "_" で始めると、Vercelはそれを関数として数えない。
   ・呼び出しは ?action=quote|search|metrics で振り分ける。
     それ以外のパラメータ（symbols / q / symbol）は今までと同じ。

   例）/api/stocks?action=quote&symbols=AAPL,TSLA
       /api/stocks?action=search&q=IONQ
       /api/stocks?action=metrics&symbol=AAPL
   ========================================================================= */
const quote = require("./_quote");
const search = require("./_search");
const metrics = require("./_metrics");

const HANDLERS = { quote, search, metrics };

module.exports = async (req, res) => {
  const action = typeof req.query.action === "string" ? req.query.action : "";
  const handler = HANDLERS[action];
  if(!handler){
    res.status(400).json({ error: "invalid-action", message: "action は quote / search / metrics のいずれかを指定してください。" });
    return;
  }
  return handler(req, res);
};
