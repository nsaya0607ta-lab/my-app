import { outLine, errLine } from './_util.js';

// Linuxプレイグラウンド内で使う最小限の疑似リポジトリ。
// 実際のネットワークには接続せず、LPIC Level 1で扱う基本操作だけを再現する。
const REPOSITORIES = {
  redhat: {
    httpd:       { version:"2.4.62-1.el9", summary:"Apache HTTP Server", deps:["apr","apr-util"] },
    apr:         { version:"1.7.0-12.el9", summary:"Apache Portable Runtime", deps:[] },
    "apr-util": { version:"1.6.1-23.el9", summary:"APR utility library", deps:["apr"] },
    openssl:     { version:"3.2.2-6.el9", summary:"Utilities from the general purpose cryptography library", deps:["openssl-libs"] },
    "openssl-libs": { version:"3.2.2-6.el9", summary:"OpenSSL shared libraries", deps:[] },
    vsftpd:      { version:"3.0.5-6.el9", summary:"Very Secure Ftp Daemon", deps:[] },
    lftp:        { version:"4.9.2-5.el9", summary:"Sophisticated file transfer program", deps:["openssl-libs"] },
    curl:        { version:"8.5.0-10.el9", summary:"Command line tool for transferring data", deps:["openssl-libs"] },
  },
  debian: {
    apache2:     { version:"2.4.62-1ubuntu1", summary:"Apache HTTP Server", deps:["apache2-bin","apache2-utils"] },
    "apache2-bin": { version:"2.4.62-1ubuntu1", summary:"Apache HTTP Server binaries", deps:[] },
    "apache2-utils": { version:"2.4.62-1ubuntu1", summary:"Apache utility programs", deps:[] },
    curl:        { version:"8.5.0-2ubuntu10", summary:"Command line tool for transferring data", deps:["libcurl4"] },
    libcurl4:    { version:"8.5.0-2ubuntu10", summary:"Easy-to-use client-side URL transfer library", deps:[] },
    vsftpd:      { version:"3.0.5-0ubuntu1", summary:"Lightweight FTP server", deps:[] },
    nginx:       { version:"1.24.0-2ubuntu7", summary:"Small, powerful, scalable web/proxy server", deps:["nginx-common"] },
    "nginx-common": { version:"1.24.0-2ubuntu7", summary:"Common files for nginx", deps:[] },
    "libbackup1": { version:"1.4.0-1", summary:"Runtime library required by backup-agent", deps:[] },
    openssl:     { version:"3.0.13-0ubuntu3", summary:"Secure Sockets Layer toolkit", deps:["libssl3"] },
    libssl3:     { version:"3.0.13-0ubuntu3", summary:"Secure Sockets Layer toolkit shared libraries", deps:[] },
  },
};

const LOCAL_PACKAGES = {
  "monitor-agent-1.0.0.rpm": { family:"redhat", name:"monitor-agent", version:"1.0.0", summary:"Vendor monitoring agent", deps:[] },
  "backup-agent_2.0.0_amd64.deb": { family:"debian", name:"backup-agent", version:"2.0.0", summary:"Vendor backup agent", deps:["libbackup1"] },
  "tool_1.0.0_all.deb": { family:"debian", name:"tool", version:"1.0.0", summary:"Internal utility tool", deps:[] },
};

function basename(path){ return String(path || "").split("/").filter(Boolean).pop() || ""; }

function parseInstalled(spec){
  const map = new Map();
  String(spec || "").split(";").map(s => s.trim()).filter(Boolean).forEach(item => {
    const idx = item.indexOf("=");
    if(idx === -1) map.set(item, "1.0.0");
    else map.set(item.slice(0, idx), item.slice(idx + 1));
  });
  return map;
}

function ensureState(ctx){
  const family = ctx.state.env.get("PKG_SYSTEM") || "debian";
  if(!ctx.state.packageManagerState || ctx.state.packageManagerState.family !== family){
    const defaultInstalled = family === "redhat"
      ? "bash=5.1.8-9.el9;coreutils=8.32-36.el9;openssl=3.0.7-20.el9"
      : "bash=5.2.21-2ubuntu4;coreutils=9.4-3ubuntu6;curl=8.5.0-2ubuntu9";
    ctx.state.packageManagerState = {
      family,
      installed: parseInstalled(ctx.state.env.get("PKG_INSTALLED") || defaultInstalled),
      broken: new Set(String(ctx.state.env.get("PKG_BROKEN") || "").split(",").map(s => s.trim()).filter(Boolean)),
      repoFresh: (ctx.state.env.get("PKG_REPO_FRESH") || "1") !== "0",
    };
  }
  return ctx.state.packageManagerState;
}

function requireFamily(ctx, family, cmd){
  const st = ensureState(ctx);
  if(st.family === family) return null;
  const distro = st.family === "redhat" ? "Red Hat系" : "Debian系";
  return { lines:[], err:[errLine(`${cmd}: この環境は${distro}です。使用するパッケージ管理コマンドを確認してください。`)] };
}

function requireRoot(ctx, cmd){
  if(ctx.session && ctx.session.isRoot()) return null;
  return { lines:[], err:[errLine(`${cmd}: この操作にはroot権限が必要です。suでrootへ切り替えてください。`)] };
}

function repoFor(st){ return REPOSITORIES[st.family] || {}; }

function installFromRepo(st, name, lines, seen = new Set()){
  const repo = repoFor(st);
  const pkg = repo[name];
  if(!pkg || seen.has(name)) return false;
  seen.add(name);
  pkg.deps.forEach(dep => installFromRepo(st, dep, lines, seen));
  const before = st.installed.get(name);
  st.installed.set(name, pkg.version);
  st.broken.delete(name);
  if(before !== pkg.version) lines.push(outLine(`  ${name}-${pkg.version}`));
  return true;
}

function packageInfoLines(name, pkg, installedVersion){
  return [
    outLine(`Name        : ${name}`),
    outLine(`Version     : ${installedVersion || pkg.version}`),
    outLine(`Summary     : ${pkg.summary}`),
    outLine(`Installed   : ${installedVersion ? "yes" : "no"}`),
    outLine(`Requires    : ${pkg.deps.length ? pkg.deps.join(", ") : "(none)"}`),
  ];
}

function findMatches(repo, keyword){
  const q = String(keyword || "").toLowerCase();
  return Object.entries(repo).filter(([name, pkg]) => name.toLowerCase().includes(q) || pkg.summary.toLowerCase().includes(q));
}

export function runDnfLike(ctx, program){
  const wrong = requireFamily(ctx, "redhat", program); if(wrong) return wrong;
  const st = ensureState(ctx);
  const args = ctx.args.filter(a => a !== "-y" && a !== "--assumeyes");
  const sub = args[0];
  const target = args[1];
  const repo = repoFor(st);

  if(!sub) return { lines:[], err:[errLine(`usage: ${program} install|remove|update|search|info パッケージ名`)] };

  if(sub === "search"){
    if(!target) return { lines:[], err:[errLine(`${program}: search requires a keyword`)] };
    const matches = findMatches(repo, target);
    const lines = [outLine(`検索結果: ${target}`)];
    matches.forEach(([name,pkg]) => lines.push(outLine(`${name.padEnd(20)} ${pkg.summary}`)));
    if(!matches.length) lines.push(outLine("一致するパッケージはありません。"));
    return { lines, err:[] };
  }

  if(sub === "info"){
    if(!target || !repo[target]) return { lines:[], err:[errLine(`Error: No matching Packages to list: ${target || ""}`)] };
    return { lines:packageInfoLines(target, repo[target], st.installed.get(target)), err:[] };
  }

  if(sub === "list" && (target === "installed" || args.includes("--installed"))){
    return { lines:Array.from(st.installed).sort().map(([n,v]) => outLine(`${n}.${"x86_64".padEnd(10)} ${v}`)), err:[] };
  }

  const rootErr = requireRoot(ctx, program); if(rootErr) return rootErr;

  if(sub === "install"){
    if(!target) return { lines:[], err:[errLine(`Error: No packages marked for install.`)] };
    const localName = basename(target);
    if(target.endsWith(".rpm")){
      const local = LOCAL_PACKAGES[localName];
      if(!local || local.family !== "redhat") return { lines:[], err:[errLine(`Error: Could not open: ${target}`)] };
      const lines = [outLine("Dependencies resolved."), outLine("Installing:")];
      local.deps.forEach(dep => installFromRepo(st, dep, lines));
      st.installed.set(local.name, local.version);
      lines.push(outLine(`  ${local.name}-${local.version}`), outLine("Complete!"));
      return { lines, err:[] };
    }
    if(!repo[target]) return { lines:[], err:[errLine(`Error: Unable to find a match: ${target}`)] };
    const lines = [outLine("Dependencies resolved."), outLine("Installing:")];
    installFromRepo(st, target, lines);
    lines.push(outLine("Complete!"));
    return { lines, err:[] };
  }

  if(sub === "remove" || sub === "erase"){
    if(!target || !st.installed.has(target)) return { lines:[], err:[errLine(`No match for argument: ${target || ""}`)] };
    st.installed.delete(target); st.broken.delete(target);
    return { lines:[outLine("Dependencies resolved."), outLine(`Removing: ${target}`), outLine("Complete!")], err:[] };
  }

  if(sub === "update" || sub === "upgrade"){
    const names = target ? [target] : Array.from(st.installed.keys());
    const lines = [outLine("Dependencies resolved."), outLine("Upgrading:")];
    let changed = 0;
    names.forEach(name => {
      if(repo[name] && st.installed.has(name) && st.installed.get(name) !== repo[name].version){
        st.installed.set(name, repo[name].version);
        lines.push(outLine(`  ${name}-${repo[name].version}`)); changed++;
      }
    });
    if(!changed) lines.push(outLine("Nothing to do."));
    lines.push(outLine("Complete!"));
    return { lines, err:[] };
  }

  return { lines:[], err:[errLine(`${program}: unknown command: ${sub}`)] };
}

export function runRpm(ctx){
  const wrong = requireFamily(ctx, "redhat", "rpm"); if(wrong) return wrong;
  const st = ensureState(ctx);
  const flags = ctx.args.filter(a => a.startsWith("-")).join("");
  const operands = ctx.args.filter(a => !a.startsWith("-"));
  const target = operands[0];
  const repo = repoFor(st);

  if(flags.includes("q")){
    if(flags.includes("a")) return { lines:Array.from(st.installed).sort().map(([n,v]) => outLine(`${n}-${v}`)), err:[] };
    if(!target || !st.installed.has(target)) return { lines:[], err:[errLine(`package ${target || ""} is not installed`)] };
    const version = st.installed.get(target);
    if(flags.includes("i")){
      const pkg = repo[target] || {version,summary:"Locally installed package",deps:[]};
      return { lines:packageInfoLines(target,pkg,version), err:[] };
    }
    if(flags.includes("R")){
      const pkg = repo[target] || Object.values(LOCAL_PACKAGES).find(p => p.name === target) || {deps:[]};
      return { lines:(pkg.deps.length ? pkg.deps : ["rpmlib(CompressedFileNames)"]).map(outLine), err:[] };
    }
    return { lines:[outLine(`${target}-${version}`)], err:[] };
  }

  if(flags.includes("i") || flags.includes("U")){
    const rootErr = requireRoot(ctx, "rpm"); if(rootErr) return rootErr;
    const file = basename(target);
    const local = LOCAL_PACKAGES[file];
    if(!local || local.family !== "redhat") return { lines:[], err:[errLine(`error: open of ${target || ""} failed: No such file or directory`)] };
    const missing = local.deps.filter(dep => !st.installed.has(dep));
    if(missing.length){
      return { lines:[], err:[errLine("error: Failed dependencies:"), ...missing.map(dep => errLine(`        ${dep} is needed by ${local.name}-${local.version}`))] };
    }
    st.installed.set(local.name, local.version);
    return { lines:[outLine("Preparing...                          ################################# [100%]"), outLine(`Updating / installing... ${local.name}-${local.version} ################################# [100%]`)], err:[] };
  }

  if(flags.includes("e")){
    const rootErr = requireRoot(ctx, "rpm"); if(rootErr) return rootErr;
    if(!target || !st.installed.has(target)) return { lines:[], err:[errLine(`error: package ${target || ""} is not installed`)] };
    st.installed.delete(target); st.broken.delete(target);
    return { lines:[], err:[] };
  }

  return { lines:[], err:[errLine("usage: rpm -q|-qa|-qi|-qR パッケージ名 / rpm -ivh ファイル.rpm / rpm -e パッケージ名")] };
}

export function runApt(ctx){
  const wrong = requireFamily(ctx, "debian", "apt"); if(wrong) return wrong;
  const st = ensureState(ctx);
  const args = ctx.args.filter(a => a !== "-y" && a !== "--yes");
  const fixMode = args.includes("-f") || args.includes("--fix-broken");
  const cleaned = args.filter(a => a !== "-f" && a !== "--fix-broken");
  const sub = cleaned[0];
  const target = cleaned[1];
  const repo = repoFor(st);

  if(sub === "search"){
    if(!target) return { lines:[], err:[errLine("apt: search requires a keyword")] };
    const lines = [outLine("Sorting... Done"), outLine("Full Text Search... Done")];
    findMatches(repo,target).forEach(([name,pkg]) => lines.push(outLine(`${name}/stable ${pkg.version} amd64\n  ${pkg.summary}`)));
    return { lines, err:[] };
  }

  if(sub === "show"){
    if(!target || !repo[target]) return { lines:[], err:[errLine(`E: No packages found: ${target || ""}`)] };
    return { lines:[outLine(`Package: ${target}`), outLine(`Version: ${repo[target].version}`), outLine(`Depends: ${repo[target].deps.join(", ") || "(none)"}`), outLine(`Description: ${repo[target].summary}`)], err:[] };
  }

  if(sub === "list" && cleaned.includes("--installed")){
    return { lines:[outLine("Listing... Done"), ...Array.from(st.installed).sort().map(([n,v]) => outLine(`${n}/now ${v} amd64 [installed]`))], err:[] };
  }

  const rootErr = requireRoot(ctx, "apt"); if(rootErr) return rootErr;

  if(sub === "update"){
    st.repoFresh = true;
    return { lines:[outLine("Hit:1 http://archive.ubuntu.com/ubuntu stable InRelease"), outLine("Reading package lists... Done"), outLine("Building dependency tree... Done")], err:[] };
  }

  if(sub === "upgrade"){
    const lines = [outLine("Reading package lists... Done"), outLine("The following packages will be upgraded:")];
    let changed = 0;
    Array.from(st.installed.keys()).forEach(name => {
      if(repo[name] && st.installed.get(name) !== repo[name].version){ st.installed.set(name,repo[name].version); lines.push(outLine(`  ${name}`)); changed++; }
    });
    lines.push(outLine(`${changed} upgraded, 0 newly installed, 0 to remove.`));
    return { lines, err:[] };
  }

  if(sub === "install" && fixMode){
    const lines = [outLine("Correcting dependencies... Done")];
    Array.from(st.broken).forEach(name => {
      const local = Object.values(LOCAL_PACKAGES).find(p => p.name === name && p.family === "debian");
      (local ? local.deps : []).forEach(dep => installFromRepo(st,dep,lines));
      st.broken.delete(name);
      lines.push(outLine(`Setting up ${name} (${st.installed.get(name) || "unknown"}) ...`));
    });
    if(!lines.slice(1).length) lines.push(outLine("0 upgraded, 0 newly installed, 0 to remove."));
    return { lines, err:[] };
  }

  if(sub === "install"){
    if(!target) return { lines:[], err:[errLine("E: Unable to locate package") ] };
    if(target.endsWith(".deb")){
      const file = basename(target); const local = LOCAL_PACKAGES[file];
      if(!local || local.family !== "debian") return { lines:[], err:[errLine(`E: Unsupported file ${target}`)] };
      const lines = [outLine("Reading package lists... Done"), outLine("The following NEW packages will be installed:")];
      local.deps.forEach(dep => installFromRepo(st,dep,lines));
      st.installed.set(local.name,local.version); st.broken.delete(local.name);
      lines.push(outLine(`  ${local.name}`), outLine(`Setting up ${local.name} (${local.version}) ...`));
      return { lines, err:[] };
    }
    if(!repo[target]) return { lines:[], err:[errLine(`E: Unable to locate package ${target}`)] };
    const lines = [outLine("Reading package lists... Done"), outLine("The following NEW packages will be installed:")];
    installFromRepo(st,target,lines);
    lines.push(outLine(`Setting up ${target} (${st.installed.get(target)}) ...`));
    return { lines, err:[] };
  }

  if(sub === "remove" || sub === "purge"){
    if(!target || !st.installed.has(target)) return { lines:[], err:[errLine(`E: Package '${target || ""}' is not installed`)] };
    st.installed.delete(target); st.broken.delete(target);
    return { lines:[outLine("Reading package lists... Done"), outLine(`Removing ${target} ...`), ...(sub === "purge" ? [outLine(`Purging configuration files for ${target} ...`)] : [])], err:[] };
  }

  return { lines:[], err:[errLine(`apt: unknown command ${sub || ""}`)] };
}

export function runDpkg(ctx){
  const wrong = requireFamily(ctx, "debian", "dpkg"); if(wrong) return wrong;
  const st = ensureState(ctx);
  const flags = ctx.args.filter(a => a.startsWith("-")).join("");
  const operands = ctx.args.filter(a => !a.startsWith("-"));
  const target = operands[0];
  const repo = repoFor(st);

  if(flags.includes("l")){
    const q = target || "";
    const lines = [outLine("Desired=Unknown/Install/Remove/Purge/Hold"), outLine("||/ Name                 Version              Architecture Description")];
    Array.from(st.installed).sort().filter(([n]) => !q || n.includes(q)).forEach(([n,v]) => lines.push(outLine(`ii  ${n.padEnd(20)} ${v.padEnd(20)} amd64        ${(repo[n] && repo[n].summary) || "installed package"}`)));
    return { lines, err:[] };
  }

  if(flags.includes("s")){
    if(!target || !st.installed.has(target)) return { lines:[], err:[errLine(`dpkg-query: package '${target || ""}' is not installed`)] };
    const pkg = repo[target] || Object.values(LOCAL_PACKAGES).find(p => p.name === target) || {summary:"Locally installed package",deps:[]};
    return { lines:[outLine(`Package: ${target}`), outLine(`Status: ${st.broken.has(target) ? "install ok unpacked" : "install ok installed"}`), outLine(`Version: ${st.installed.get(target)}`), outLine(`Depends: ${pkg.deps.join(", ") || "(none)"}`), outLine(`Description: ${pkg.summary}`)], err:[] };
  }

  if(flags.includes("i")){
    const rootErr = requireRoot(ctx, "dpkg"); if(rootErr) return rootErr;
    const file = basename(target); const local = LOCAL_PACKAGES[file];
    if(!local || local.family !== "debian") return { lines:[], err:[errLine(`dpkg: error: cannot access archive '${target || ""}': No such file or directory`)] };
    st.installed.set(local.name,local.version);
    const missing = local.deps.filter(dep => !st.installed.has(dep));
    const lines = [outLine(`Selecting previously unselected package ${local.name}.`), outLine(`Unpacking ${local.name} (${local.version}) ...`)];
    if(missing.length){
      st.broken.add(local.name);
      return { lines, err:[errLine(`dpkg: dependency problems prevent configuration of ${local.name}:`), ...missing.map(dep => errLine(` ${local.name} depends on ${dep}; however: Package ${dep} is not installed.`))] };
    }
    st.broken.delete(local.name); lines.push(outLine(`Setting up ${local.name} (${local.version}) ...`));
    return { lines, err:[] };
  }

  if(flags.includes("r") || flags.includes("P")){
    const rootErr = requireRoot(ctx, "dpkg"); if(rootErr) return rootErr;
    if(!target || !st.installed.has(target)) return { lines:[], err:[errLine(`dpkg: warning: ignoring request to remove ${target || ""} which isn't installed`)] };
    st.installed.delete(target); st.broken.delete(target);
    return { lines:[outLine(`${flags.includes("P") ? "Purging" : "Removing"} ${target} ...`)], err:[] };
  }

  return { lines:[], err:[errLine("usage: dpkg -l [名前] / dpkg -s パッケージ名 / dpkg -i ファイル.deb / dpkg -r パッケージ名")] };
}
