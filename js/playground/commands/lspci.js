import { outLine } from './_util.js';

// PCIバスに接続されているデバイスの一覧（固定・演出用）。
const DEVICES = [
  "00:00.0 Host bridge: Intel Corporation Alder Lake-S Host Bridge/DRAM Registers",
  "00:02.0 VGA compatible controller: Intel Corporation Alder Lake-S GT1",
  "01:00.0 VGA compatible controller: NVIDIA Corporation GA106 [GeForce RTX 3060]",
  "02:00.0 Ethernet controller: Intel Corporation Ethernet Connection I219-V",
  "03:00.0 Network controller: Intel Corporation Wi-Fi 6 AX200",
  "04:00.0 Audio device: Intel Corporation Alder Lake-S HD Audio Controller",
  "05:00.0 SATA controller: Intel Corporation Alder Lake-S SATA AHCI Controller",
  "06:00.0 USB controller: Intel Corporation Alder Lake-S USB 3.1 xHCI Controller",
];

export default function lspci(){
  return { lines: DEVICES.map(outLine), err: [] };
}
