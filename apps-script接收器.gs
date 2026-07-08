// 極光盾發文中心 · 訊息接收器（Google Apps Script）
// 部署方式見同資料夾說明。收到的訊息存在這個 Apps Script 綁定的試算表。

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

// 網頁按鈕 POST 進來 → 存一列
function doPost(e) {
  const sh = getSheet_();
  const body = e && e.postData ? e.postData.contents : "";
  sh.appendRow([new Date().toISOString(), body, ""]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Claude 用 GET 讀取未處理訊息：?secret=aurora2026&action=read
// 標記已處理：?secret=aurora2026&action=done&rows=2,3,5
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.secret !== SECRET) {
    return ContentService.createTextOutput(JSON.stringify({ error: "unauthorized" }))
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
