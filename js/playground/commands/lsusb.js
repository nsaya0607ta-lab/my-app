import { outLine } from './_util.js';

// USBバスに接続されているデバイスの一覧（固定・演出用）。
const DEVICES = [
  "Bus 002 Device 001: ID 1d6b:0003 Linux Foundation 3.0 root hub",
  "Bus 001 Device 001: ID 1d6b:0002 Linux Foundation 2.0 root hub",
  "Bus 001 Device 004: ID 046d:c52b Logitech, Inc. Unifying Receiver",
  "Bus 001 Device 005: ID 046d:c077 Logitech, Inc. M105 Corded Mouse",
  "Bus 001 Device 006: ID 0951:1666 Kingston Technology DataTraveler 100 G3",
];

export default function lsusb(){
  return { lines: DEVICES.map(outLine), err: [] };
}
