/* =========================================================================
   diskCatalog — 「ディスク・パーティション管理」編のシナリオが参照する
   ブロックデバイス（/dev/sda・/dev/sdb）の初期状態。lsblk/fdisk/df の
   出力はすべてここと shellState.disks / shellState.mounts（実行時に
   fdisk・mkfs.ext4・mount で変化する）から組み立てる。
   ========================================================================= */

export const GIB = 1024 ** 3;

// sda: OSがすでに使用中の既存ディスク。sdb: 今回のシナリオで追加された
// 未使用の新しいディスク（パーティションなし）。
export const DISK_CATALOG = {
  sda: { device: "/dev/sda", sizeBytes: 32 * GIB, model: "Virtual disk", majMin: "8:0",  identifier: "3a1e9f2c-2b7d-4b0a-9c3e-1a2b3c4d5e6f" },
  sdb: { device: "/dev/sdb", sizeBytes: 500 * GIB, model: "Virtual disk", majMin: "8:16", identifier: "8f4c2d1a-6e5b-4a3c-9d8e-7f6a5b4c3d2e" },
};

// 既存の df.js が表示していた内容と一致させる（sda1=/, sda2=/boot, sda3=/home）
export const DEFAULT_PARTITIONS = {
  sda: [
    { num: 1, sizeBytes: 20 * GIB, fsType: "ext4" },
    { num: 2, sizeBytes: 1 * GIB,  fsType: "ext4" },
    { num: 3, sizeBytes: 10 * GIB, fsType: "ext4" },
  ],
  sdb: [],
};

export const DEFAULT_MOUNTS = [
  { device: "/dev/sda1", mountpoint: "/",        fsType: "ext4" },
  { device: "/dev/sda2", mountpoint: "/boot",     fsType: "ext4" },
  { device: "/dev/sda3", mountpoint: "/home",     fsType: "ext4" },
  { device: "tmpfs",     mountpoint: "/dev/shm",  fsType: "tmpfs" },
];

// "/dev/sdb" -> "sdb" のようにディスク名だけを取り出す（一致しなければnull）
export function diskNameFromDevice(arg){
  const m = /^\/dev\/(sd[a-z])$/.exec(String(arg || ""));
  return m ? m[1] : null;
}

// "/dev/sdb1" -> {diskName:"sdb", partNum:1} のようにパーティション指定を分解する
export function partitionRefFromDevice(arg){
  const m = /^\/dev\/(sd[a-z])(\d+)$/.exec(String(arg || ""));
  if(!m) return null;
  return { diskName: m[1], partNum: parseInt(m[2], 10) };
}
