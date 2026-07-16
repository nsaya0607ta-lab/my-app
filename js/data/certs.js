import { AZ900_CONCEPTS, AZ900_Q, AZ900_TIERS } from './az900.js';
import { CONCEPTS, Q, TIERS } from '../core.js';
import { LPIC1_CONCEPTS, LPIC1_Q, LPIC1_TIERS } from './lpic1.js';
import { LPIC1_CMD_Q } from './lpic1-commands.js';
import { LPIC1_ADVANCED_Q } from './lpic1-advanced.js';
import { LPIC1_UUID_CONCEPTS, LPIC1_UUID_Q } from './lpic1-uuid.js';
import { LPIC1_FILESYSTEM_CONCEPTS, LPIC1_FILESYSTEM_Q } from './lpic1-filesystem.js';
import { SC300_CONCEPTS, SC300_Q, SC300_TIERS } from './sc300.js';

export const CERTS = [
  { id:"az900", code:"AZ-900", name:"Azure 基礎", sub:"Microsoft Azure Fundamentals",
    vendor:"microsoft", accent:"#38a3ff", draw:45, pass:700, status:"ready",
    Q:AZ900_Q, CONCEPTS:AZ900_CONCEPTS, TIERS:AZ900_TIERS },
  { id:"sc300", code:"SC-300", name:"セキュリティ中級", sub:"Microsoft Identity and Access Administrator",
    vendor:"microsoft", accent:"#38a3ff", draw:45, pass:700, status:"ready",
    Q:SC300_Q, CONCEPTS:SC300_CONCEPTS, TIERS:SC300_TIERS },
  { id:"sc900", code:"SC-900", name:"セキュリティ基礎", sub:"Security, Compliance, and Identity Fundamentals",
    vendor:"microsoft", accent:"#36d399", draw:45, pass:700, status:"coming" },
  // 例）追加するときの雛形：
  // { id:"ai900", code:"AI-900", name:"AI 基礎", sub:"Azure AI Fundamentals",
  //   vendor:"microsoft", accent:"#c084fc", draw:45, pass:700, status:"ready", Q:AI900_Q, CONCEPTS:AI900_CONCEPTS, TIERS:AI900_TIERS },

  { id:"lpic1", code:"LPIC-1", name:"Linux 技術者認定 レベル1", sub:"Linux Administrator（基礎）",
    vendor:"lpic", accent:"#f5a623", draw:24, pass:700, status:"ready",
    Q:[...LPIC1_Q, ...LPIC1_UUID_Q, ...LPIC1_FILESYSTEM_Q], CONCEPTS:[...LPIC1_CONCEPTS, ...LPIC1_UUID_CONCEPTS, ...LPIC1_FILESYSTEM_CONCEPTS], TIERS:LPIC1_TIERS, extraQ:[...LPIC1_CMD_Q, ...LPIC1_ADVANCED_Q] },
  { id:"lpic2", code:"LPIC-2", name:"Linux 技術者認定 レベル2", sub:"Linux Engineer（中級）",
    vendor:"lpic", accent:"#e8590c", draw:24, pass:700, status:"coming" },
  { id:"lpic3", code:"LPIC-3", name:"Linux 技術者認定 レベル3", sub:"Linux Enterprise Professional（上級）",
    vendor:"lpic", accent:"#862e1b", draw:24, pass:700, status:"coming" },
];
