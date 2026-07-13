/* =========================================================================
   ModuleCatalog — lsmod / modprobe / modinfo が参照する「インストール済み
   カーネルモジュール」のカタログ。実際のLinuxと同様、modinfoは読み込み済み
   かどうかに関わらずここから情報を返し、lsmodは shellState.kernelModules
   （＝現在読み込まれているものだけ）を見る、という役割分担にしている。
   ========================================================================= */

export const MODULE_CATALOG = {
  nvidia: {
    size: 39321600, usedBy: 42,
    filename: "/lib/modules/6.8.0-generic/kernel/drivers/video/nvidia.ko",
    description: "NVIDIA GPU driver",
    author: "NVIDIA Corporation",
    license: "NVIDIA",
    depends: "-",
    vermagic: "6.8.0-generic SMP mod_unload modversions",
  },
  usbhid: {
    size: 77824, usedBy: 2,
    filename: "/lib/modules/6.8.0-generic/kernel/drivers/hid/usbhid/usbhid.ko",
    description: "USB HID core driver",
    author: "Andreas Gal, Vojtech Pavlik",
    license: "GPL",
    depends: "-",
    vermagic: "6.8.0-generic SMP mod_unload modversions",
  },
  ext4: {
    size: 1064960, usedBy: 1,
    filename: "/lib/modules/6.8.0-generic/kernel/fs/ext4/ext4.ko",
    description: "Fourth Extended Filesystem",
    author: "Remy Card, Stephen Tweedie and others",
    license: "GPL",
    depends: "jbd2,mbcache",
    vermagic: "6.8.0-generic SMP mod_unload modversions",
  },
  snd_hda_intel: {
    size: 61440, usedBy: 1,
    filename: "/lib/modules/6.8.0-generic/kernel/sound/pci/hda/snd_hda_intel.ko",
    description: "Intel HD Audio driver",
    author: "Takashi Iwai",
    license: "GPL",
    depends: "snd_hda_codec,snd_hda_core",
    vermagic: "6.8.0-generic SMP mod_unload modversions",
  },
  xhci_pci: {
    size: 24576, usedBy: 0,
    filename: "/lib/modules/6.8.0-generic/kernel/drivers/usb/host/xhci-pci.ko",
    description: "xHCI PCI Host Controller Driver",
    author: "Sarah Sharp",
    license: "GPL",
    depends: "xhci_hcd",
    vermagic: "6.8.0-generic SMP mod_unload modversions",
  },
  sd_mod: {
    size: 69632, usedBy: 3,
    filename: "/lib/modules/6.8.0-generic/kernel/drivers/scsi/sd_mod.ko",
    description: "SCSI disk (sd) driver",
    author: "Eric Youngdale",
    license: "GPL",
    depends: "-",
    vermagic: "6.8.0-generic SMP mod_unload modversions",
  },
  iwlwifi: {
    size: 638976, usedBy: 0,
    filename: "/lib/modules/6.8.0-generic/kernel/drivers/net/wireless/intel/iwlwifi/iwlwifi.ko",
    description: "Intel(R) Wireless WiFi driver for Linux",
    author: "Intel Corporation <linuxwifi@intel.com>",
    license: "GPL",
    depends: "cfg80211",
    vermagic: "6.8.0-generic SMP mod_unload modversions",
  },
  e1000e: {
    size: 356352, usedBy: 0,
    filename: "/lib/modules/6.8.0-generic/kernel/drivers/net/ethernet/intel/e1000e/e1000e.ko",
    description: "Intel(R) PRO/1000 Network Driver",
    author: "Intel Corporation <linux.nics@intel.com>",
    license: "GPL",
    depends: "-",
    vermagic: "6.8.0-generic SMP mod_unload modversions",
  },
};

// 新品のマシンにありがちな「元から入っている」モジュール群。
// iwlwifi（Wi-Fi）と e1000e（有線LAN）はシナリオ上あえて未読み込みにしてある。
export const DEFAULT_LOADED_MODULES = ["nvidia", "usbhid", "ext4", "snd_hda_intel", "xhci_pci", "sd_mod"];
