import { getIpRange, ipToNum, numToIp, stars, start } from '../core.js';

export const PT_SHOP = [
  { key:"vnet",   icon:"🌐", name:"VNet" },
  { key:"subnet", icon:"🗂️", name:"サブネット" },
  { key:"vm",     icon:"🖥️", name:"VM" },
  { key:"lb",     icon:"⚖️", name:"LB" },
];
/* 難易度(星)→クリア報酬BP */

export const MISSIONS = [
  {
    id: "m1",
    title: "基本の1台！単一Webサーバーの構築",
    desc: "VNetの中にサブネットを作り、Webサーバー用のVMを1台デプロイせよ！アドレス設計（プレフィックス長・IP）も入力しよう。",
    stars: 1,
    hints: [
      "🌐VNetを箱庭へドラッグしてデプロイし、プレフィックス長（例: 16）を入力します。",
      "🗂️サブネットをVNetの中へドラッグし、プレフィックス長（例: 24）を入力します。",
      "🖥️VMをサブネットへドラッグし、第4オクテット（例: 4）を入力します。",
      "範囲の包含が大切：VNet(/16) ⊃ サブネット(/24) ⊃ VM。サブネットのプレフィックス長はVNetより大きい数字にします。"
    ],
    check: (inf) => {
      if (!inf.vnet || (inf.vnetPrefix || "").trim() === "") return { ok: false, msg: "❌ VNetが配置されていないか、プレフィックス長が未入力です。" };
      if (inf.subnets.length < 1) return { ok: false, msg: "❌ VNetの中にサブネットを1つ以上配置してください。" };
      
      const vRange = getIpRange("10.0.0.0", inf.vnetPrefix);
      if (!vRange) return { ok: false, msg: "❌ VNetのプレフィックス長が不正です（8〜30）。" };

      const s = inf.subnets[0];
      if ((s.prefix || "").trim() === "") return { ok: false, msg: "❌ サブネットのプレフィックス長を入力してください。" };
      const sRange = getIpRange("10.0.1.0", s.prefix);
      if (!sRange) return { ok: false, msg: "❌ サブネットのプレフィックス長が不正です（8〜30）。" };

      // VNet ⊃ サブネット の包含チェック
      if (sRange.start < vRange.start || sRange.end > vRange.end) {
        return { ok: false, msg: `❌ サブネットの範囲 [${numToIp(sRange.start)}〜${numToIp(sRange.end)}] が、VNetの許容範囲 [${numToIp(vRange.start)}〜${numToIp(vRange.end)}] からはみ出しています！` };
      }

      if (s.vms.length < 1) return { ok: false, msg: "❌ サブネットの中にVMを配置してください。" };
      const vm = s.vms[0];
      if ((vm.octet || "").trim() === "") return { ok: false, msg: "❌ VMのIP（第4オクテット）を入力してください。" };
      
      const vmNum = ipToNum("10.0.1." + vm.octet);
      if (vmNum === null) return { ok: false, msg: "❌ VMのIPアドレスの形式が正しくありません。" };

      // サブネット ⊃ VM のチェック
      if (vmNum < sRange.start || vmNum > sRange.end) {
        return { ok: false, msg: `❌ VMのIP [10.0.1.${vm.octet}] は、所属サブネットの範囲 [10.0.1.0〜] に収まっていません！` };
      }

      // Azure予約IPのチェック
      const lastOct = parseInt(vm.octet, 10);
      if (vmNum === sRange.start || vmNum === sRange.end || (lastOct >= 1 && lastOct <= 3)) {
        return { ok: false, msg: `⚠️ Azure予約IPエラー！\n末尾 .${lastOct} はネットワークアドレスやAzure予約IP（.1〜.3など）のため、VMに割り当てられません！` };
      }

      return { ok: true };
    }
  },
  {
    id: "m2",
    title: "冗長化Web！ロードバランサー構成",
    desc: "VNetに2つのサブネットを作り、Front(Web)に2台・Back(DB)に1台のVMを配置。LBも置いて可用性を高めよ！",
    stars: 2,
    hints: [
      "VNetをデプロイし、サブネットを2つ配置します。",
      "Loadbalancer(⚖️)はVNetヘッダーのスロットへドラッグします。",
      "1つ目のサブネットにVMを2台、2つ目にVMを1台置きます。"
    ],
    check: (inf) => {
      if (!inf.vnet || (inf.vnetPrefix || "").trim() === "") return { ok: false, msg: "❌ VNetが配置されていないか、プレフィックス長が未入力です。" };
      if (!inf.lb) return { ok: false, msg: "❌ ロードバランサー（⚖️）が設置されていません。" };
      if (inf.subnets.length < 2) return { ok: false, msg: "❌ サブネットが2つ以上必要です（Front用とBack用）。" };

      const vRange = getIpRange("10.0.0.0", inf.vnetPrefix);
      if (!vRange) return { ok: false, msg: "❌ VNetのプレフィックス長が不正です。" };

      // ループで全サブネットと全VMを網羅検証
      for (let i = 0; i < 2; i++) {
        const s = inf.subnets[i];
        if ((s.prefix || "").trim() === "") return { ok: false, msg: `❌ サブネット${i+1}のプレフィックス長を入力してください。` };
        const sRange = getIpRange(`10.0.${i+1}.0`, s.prefix);
        if (!sRange) return { ok: false, msg: `❌ サブネット${i+1}のプレフィックス長が不正です。` };

        if (sRange.start < vRange.start || sRange.end > vRange.end) {
          return { ok: false, msg: `❌ サブネット${i+1}の範囲が、VNetの許容範囲からはみ出しています！` };
        }

        const requiredVmCount = i === 0 ? 2 : 1;
        if (s.vms.length < requiredVmCount) return { ok: false, msg: `❌ サブネット${i+1}（${i===0?'Front':'Back'}）にはVMを ${requiredVmCount} 台以上配置してください。` };

        for (let j = 0; j < s.vms.length; j++) {
          const vm = s.vms[j];
          if ((vm.octet || "").trim() === "") return { ok: false, msg: `❌ サブネット${i+1}の ${j+1}台目のVMのIPが未入力です。` };
          const vmNum = ipToNum(`10.0.${i+1}.` + vm.octet);
          
          if (vmNum < sRange.start || vmNum > sRange.end) {
            return { ok: false, msg: `❌ サブネット${i+1}のVM [10.0.${i+1}.${vm.octet}] がサブネットの範囲外です。` };
          }
          const lastOct = parseInt(vm.octet, 10);
          if (vmNum === sRange.start || vmNum === sRange.end || (lastOct >= 1 && lastOct <= 3)) {
            return { ok: false, msg: `⚠️ サブネット${i+1}のVMでAzure予約IP（.${lastOct}）が検出されました。回避してください。` };
          }
        }
      }
      return { ok: true };
    }
  }
];
