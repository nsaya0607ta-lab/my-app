import { AZ900_CONCEPTS, AZ900_Q, AZ900_TIERS } from './az900.js';
import { CONCEPTS, Q, TIERS } from '../core.js';
import { SC300_CONCEPTS, SC300_Q, SC300_TIERS } from './sc300.js';

export const CERTS = [
  { id:"az900", code:"AZ-900", name:"Azure 基礎", sub:"Microsoft Azure Fundamentals",
    accent:"#38a3ff", draw:45, pass:700, status:"ready",
    Q:AZ900_Q, CONCEPTS:AZ900_CONCEPTS, TIERS:AZ900_TIERS },
  { id:"sc300", code:"SC-300", name:"セキュリティ中級", sub:"Microsoft Identity and Access Administrator",
    accent:"#38a3ff", draw:45, pass:700, status:"ready",
    Q:SC300_Q, CONCEPTS:SC300_CONCEPTS, TIERS:SC300_TIERS },
  { id:"sc900", code:"SC-900", name:"セキュリティ基礎", sub:"Security, Compliance, and Identity Fundamentals",
    accent:"#36d399", draw:45, pass:700, status:"coming" },
  // 例）追加するときの雛形：
  // { id:"ai900", code:"AI-900", name:"AI 基礎", sub:"Azure AI Fundamentals",
  //   accent:"#c084fc", draw:45, pass:700, status:"ready", Q:AI900_Q, CONCEPTS:AI900_CONCEPTS, TIERS:AI900_TIERS },
];
