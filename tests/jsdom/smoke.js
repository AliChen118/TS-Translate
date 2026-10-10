/**
 * TS 翻译专家 · jsdom 冒烟测试
 * ------------------------------------------------------------------
 * 在 Node 里用 jsdom 直接加载 src/ts-translate.html，
 * 断言「页面能起来 + 核心结构正确 + 数据只存本机不进文件」。
 *
 * 运行：
 *     cd tests/jsdom
 *     npm install
 *     npm test
 *
 * 说明：页面是纯前端单文件，这里的断言只依赖 jsdom，不需要浏览器。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML_PATH = path.resolve(__dirname, "..", "..", "src", "ts-translate.html");

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    failures.push(name + (extra ? "  → " + extra : ""));
    console.log("  ✗ " + name + (extra ? "  → " + extra : ""));
  }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, "实际=" + JSON.stringify(actual) + " 期望=" + JSON.stringify(expected));
}

function main() {
  console.log("页面：" + HTML_PATH);
  const html = fs.readFileSync(HTML_PATH, "utf8");

  /* ---------------------------------------------------------------- *
   * [0] 静态源码断言：文件里不能预置任何用户数据
   * ---------------------------------------------------------------- */
  console.log("\n[0] 分发文件零数据");
  const dataLiterals = [
    'localStorage.setItem("ztw_glossary",[',
    'localStorage.setItem("ztw_rules",{',
    'localStorage.setItem("ztw_config",{',
    'localStorage.setItem("ztw_ts_gen_log",[',
  ];
  for (const lit of dataLiterals) {
    ok("源码不含预置数据字面量 " + lit.slice(0, 34) + "…", html.indexOf(lit) < 0);
  }
  ok('生成记录空态 colspan=7（"跳过"列常显）', html.indexOf('colspan="7"') >= 0);

  /* ---------------------------------------------------------------- *
   * [1] 加载页面
   * ---------------------------------------------------------------- */
  console.log("\n[1] 页面加载与命名空间");
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on("jsdomError", (e) => jsErrors.push(String(e && e.message)));
  vc.on("error", (m) => jsErrors.push(String(m)));

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://127.0.0.1:18731/",
    virtualConsole: vc,
  });
  const win = dom.window;
  const doc = win.document;

  // 等页面脚本跑完（ZTW 挂载 + 首屏渲染）
  const deadline = Date.now() + 20000;
  while (!(win.ZTW && win.ZTW.store && win.ZTW.VER) && Date.now() < deadline) {
    // jsdom 是同步执行的，这里只是防御性等待
    break;
  }
  const Z = win.ZTW || {};
  ok("window.ZTW 命名空间已挂载", !!win.ZTW);
  ok("加载期间没有脚本级错误", jsErrors.length === 0, jsErrors.slice(0, 2).join(" | "));
  ok("版本号形如 x.y.z", /^\d+\.\d+\.\d+$/.test(String(Z.VER)),
    "实际=" + JSON.stringify(Z.VER));
  ok("标题为 TS翻译专家", /TS翻译专家/.test(doc.title || ""), doc.title);

  /* ---------------------------------------------------------------- *
   * [2] 页签结构
   * ---------------------------------------------------------------- */
  console.log("\n[2] 页签");
  const tabs = Array.from(doc.querySelectorAll('nav.tabs button[data-tab]'))
    .map((b) => b.getAttribute("data-tab"));
  eq("页签数量", tabs.length, 6);
  eq("页签顺序", tabs.join(","), "config,translate,glossary,rules,ts,help");

  /* ---------------------------------------------------------------- *
   * [3] 术语库 / 规则库：数据只进 localStorage
   * ---------------------------------------------------------------- */
  console.log("\n[3] 术语库与规则库");
  const store = Z.store || {};
  ok("store.saveGlossary 可用", typeof store.saveGlossary === "function");
  const g0 = (store.getGlossary && store.getGlossary()) || [];
  ok("初始术语库可读取（数组）", Array.isArray(g0), "实际=" + typeof g0);

  const demo = [
    { term: "作业监测", en: "operation monitoring", caseFix: true },
    { term: "收割机", en: "harvester", caseFix: false },
  ];
  const saved = store.saveGlossary ? store.saveGlossary(demo) : false;
  ok("写入术语库成功", saved !== false);
  const g1 = (store.getGlossary && store.getGlossary()) || [];
  eq("回读术语条数", Array.isArray(g1) ? g1.length : -1, 2);
  ok("词条内容一致", g1.length === 2 && String(g1[0].term) === "作业监测",
    JSON.stringify(g1[0] || null));
  ok("确实写进了 localStorage",
    /作业监测/.test(String(win.localStorage.getItem("ztw_glossary") || "")) ||
    /operation monitoring/.test(String(win.localStorage.getItem("ztw_glossary") || "")));
  ok("HTML 源文件未被写入数据（磁盘内容不变）",
    fs.readFileSync(HTML_PATH, "utf8").length === html.length);

  const rules = (store.getRules && store.getRules()) || null;
  ok("规则库可读取", !!rules);
  ok("规则库含正则规则数组 regexes",
    !!rules && Array.isArray(rules.regexes), "keys=" + Object.keys(rules || {}).join(","));
  ok("规则库含特殊词条数组 terms", !!rules && Array.isArray(rules.terms),
    "keys=" + Object.keys(rules || {}).join(","));

  /* ---------------------------------------------------------------- *
   * [4] TS 页：生成结果记录七列表头（"跳过"列常显）
   * ---------------------------------------------------------------- */
  console.log("\n[4] TS 生成结果记录");
  const heads = ["ts-gen-tbody", "ts2-gen-tbody"].map((id) => {
    const body = doc.getElementById(id);
    if (!body) return null;
    const table = body.closest ? body.closest("table") : null;
    if (!table) return null;
    return Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
  });
  ok("步骤一记录表存在", !!heads[0], JSON.stringify(heads[0]));
  ok("步骤二记录表存在", !!heads[1], JSON.stringify(heads[1]));
  for (const [i, h] of heads.entries()) {
    if (!h) continue;
    eq("步骤" + (i + 1) + " 记录表列数", h.length, 7);
    eq("步骤" + (i + 1) + " 表头", h.join("/"), "序号/结果文件/生成时间/成功/失败/跳过/操作");
  }
  ok("步骤表头里出现「跳过」", heads.every((h) => !!h && h.indexOf("跳过") >= 0));

  /* ---------------------------------------------------------------- *
   * [5] 帮助页：内置说明书已渲染
   * ---------------------------------------------------------------- */
  console.log("\n[5] 帮助文档");
  ok("帮助正文容器存在", !!doc.getElementById("help-md"));
  ok("帮助源 Markdown 存在", !!doc.getElementById("help-src"));
  const helpSrc = doc.getElementById("help-src");
  ok("帮助正文写明文件不含用户数据",
    !!helpSrc && /不含你的任何数据|不含任何你的数据|不含任何用户数据/.test(helpSrc.textContent));
  /* 使用说明已重写为「只面向最终使用者」的手册（功能概述 → … → 注意事项），
     版本更新记录整节移出帮助页，改由仓库 CHANGELOG.md 维护。 */
  ok("帮助页为面向使用者的手册（功能概述 → 注意事项）",
    !!helpSrc && /## 一、功能概述/.test(helpSrc.textContent)
    && /## 十、注意事项/.test(helpSrc.textContent));
  ok("帮助页不再包含「更新记录」（版本历史移至仓库 CHANGELOG.md）",
    !!helpSrc && !/更新记录/.test(helpSrc.textContent));
  ok("帮助页不含开发者向内容（接口 / 跨域 / 签名等）",
    !!helpSrc && !/接口|跨域|CORS|签名|localStorage|IndexedDB/.test(helpSrc.textContent));

  /* ---------------------------------------------------------------- *
   * [6] 第二次全新加载：不带出任何数据
   * ---------------------------------------------------------------- */
  console.log("\n[6] 全新实例（模拟把文件发给别人）");
  const dom2 = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://127.0.0.1:18731/",
    virtualConsole: vc,
  });
  const Z2 = dom2.window.ZTW || {};
  ok("新实例命名空间正常", !!(Z2.store && Z2.store.getGlossary));
  const gen2 = (Z2.store && Z2.store.getGenLog) ? Z2.store.getGenLog() : null;
  ok("新实例生成记录为空", Array.isArray(gen2) && gen2.length === 0,
    "实际=" + JSON.stringify(gen2 && gen2.length));
  const gl2 = (Z2.store && Z2.store.getGlossary) ? Z2.store.getGlossary() : null;
  ok("新实例术语库不含上实例写入的「作业监测」",
    !JSON.stringify(gl2 || []).includes("作业监测"),
    "实际条数=" + JSON.stringify(gl2 && gl2.length));

  /* ---------------------------------------------------------------- */
  console.log("\n" + "-".repeat(56));
  console.log("通过：" + pass + "  失败：" + fail);
  if (fail) {
    console.log("\n失败项：");
    failures.forEach((f) => console.log("  - " + f));
  }
  process.exit(fail ? 1 : 0);
}

main();
