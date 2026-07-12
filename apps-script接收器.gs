// 極光盾發文中心 · 訊息接收器（Google Apps Script）v2 跨機同步版
// 部署方式見同資料夾說明。收到的訊息存在這個 Apps Script 綁定的試算表。
// v2 新增（2026-07-12）：?action=state 重播 inbox 帳本、算出各卡片最新狀態，
// 讓發文中心開頁時抓雲端狀態——家裡/公司哪台按的都一樣。

const SHEET_NAME = "inbox";
const SECRET = "aurora2026"; // 讀取/清除時要帶的簡易通行碼

// 獨立版：第一次執行時自動建立專屬試算表，之後重複使用
function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty("SS_ID");
  let ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch (err) { ssId = null; }
  }
  if (!ssId) {
    ss = SpreadsheetApp.create("極光盾發文中心信箱");
    props.setProperty("SS_ID", ss.getId());
  }
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(["received_at", "payload", "processed"]);
  }
  return sh;
}

// 網頁按鈕 POST 進來 → 存一列（帳本，也是跨機同步的資料來源）
function doPost(e) {
  const sh = getSheet_();
  const body = e && e.postData ? e.postData.contents : "";
  sh.appendRow([new Date().toISOString(), body, ""]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// 跨機同步核心：從頭重播 inbox 每一筆動作，算出目前狀態
// 規則對齊網頁端 localStorage 的語意（status / metrics / comment / adhoc）
function buildState_(week) {
  const sh = getSheet_();
  const data = sh.getDataRange().getValues();
  const state = {};
  for (let i = 1; i < data.length; i++) {
    const raw = data[i][1];
    if (!raw) continue;
    let p;
    try { p = JSON.parse(String(raw)); } catch (err) { continue; }
    if (week && p.week && p.week !== week) continue;
    const id = p.id;
    if (p.kind === "status" && id) {
      if (!state[id]) state[id] = {};
      state[id].status = p.status;
    } else if (p.kind === "metrics" && id) {
      if (!state[id]) state[id] = {};
      state[id].metricsSent = true;
      state[id].metrics = {
        views: p.views || 0, likes: p.likes || 0, replies: p.replies || 0,
        reposts: p.reposts || 0, follows: p.follows || 0
      };
    } else if (p.kind === "comment" && id) {
      if (!state[id]) state[id] = {};
      state[id].status = "changes";
      state[id].pendingMsgs = (state[id].pendingMsgs || []).concat([p.text]);
    } else if (p.kind === "adhoc" && id) {
      if (!state.__adhoc) state.__adhoc = [];
      let day = p.day, when = p.when;
      if (!day && p.at) {
        const d = new Date(p.at);
        day = (d.getMonth() + 1) + "/" + d.getDate();
        when = day + "（臨時）";
      }
      if (!state.__adhoc.some(function(a){ return a.id === p.id; })) {
        state.__adhoc.push({ id: p.id, platform: p.platform, day: day, when: when, text: p.text, at: p.at });
      }
    }
  }
  return state;
}

// GET 路由：
//   跨機同步：?secret=aurora2026&action=state&week=W28  ← 發文中心開頁時呼叫
//   Claude 讀未處理訊息：?secret=aurora2026&action=read
//   標記已處理：?secret=aurora2026&action=done&rows=2,3,5
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.secret !== SECRET) {
    return ContentService.createTextOutput(JSON.stringify({ error: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (p.action === "state") {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, week: p.week || "", state: buildState_(p.week) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const sh = getSheet_();
  if (p.action === "done" && p.rows) {
    const rows = p.rows.split(",").map(Number);
    rows.forEach(r => { if (r >= 2) sh.getRange(r, 3).setValue("Y"); });
    return ContentService.createTextOutput(JSON.stringify({ ok: true, marked: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // 預設：讀取未處理
  const data = sh.getDataRange().getValues();
  const pending = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] !== "Y" && data[i][1]) {
      pending.push({ row: i + 1, received_at: data[i][0], payload: String(data[i][1]) });
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, pending: pending }))
    .setMimeType(ContentService.MimeType.JSON);
}
