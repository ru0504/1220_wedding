const SHEET_NAME = 'RSVP';
const HEADERS = [
  '送出時間',
  '姓名',
  '聯絡電話',
  'Email 或 Line ID',
  '與新人的關係',
  '飲食習慣',
  '出席意願',
  '出席人數（含本人）',
  '兒童座椅數',
  '是否需要寄送喜帖',
  '郵寄地址（含郵遞區號）',
  '祝福話語',
  '備註事項'
];

/**
 * Run once in the Apps Script editor before deployment.
 * 部署前在 Apps Script 編輯器中手動執行一次。
 * Remember the bound spreadsheet and create the RSVP tab with its headings.
 * 這會記住目前的試算表，並建立 RSVP 工作表與標題列。
 */
function setupSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('請從 Google 試算表的「擴充功能 → Apps Script」開啟並執行此程式。');
  }

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  const sheet = getOrCreateSheet_(spreadsheet);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function doPost(event) {
  const parameters = event && event.parameter ? event.parameter : {};
  // Echo the ID unchanged so the browser can match the response.
  // 識別碼只用來配對回覆，不套用試算表文字處理。
  const requestId = String(parameters.requestId || '');

  try {
    const values = readSubmission_(parameters);

    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('尚未設定試算表，請先執行 setupSheet。');
    }

    // Serialize writes so concurrent submissions do not race to create the sheet.
    // 依序處理寫入，避免同時送出的回函重複建立工作表。
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = getOrCreateSheet_(spreadsheet);
      sheet.appendRow([
        new Date(),
        values.name,
        // Force text so Sheets preserves leading zeros, even in automatically formatted cells.
        // 強制以文字儲存電話，避免試算表自動移除開頭的 0。
        values.phone.startsWith("'") ? values.phone : "'" + values.phone,
        values.contactInfo,
        values.relationship,
        values.diet,
        values.attendance,
        values.guests,
        values.kidsSeats,
        values.invitation,
        values.address,
        values.blessings,
        values.remarks
      ]);
      // Commit pending writes while the lock is still held.
      // 先完成待處理的寫入，再釋放鎖並回覆成功。
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    return browserResponse_({
      type: 'wedding-rsvp',
      requestId: requestId,
      ok: true
    });
  } catch (error) {
    console.error(error);
    return browserResponse_({
      type: 'wedding-rsvp',
      requestId: requestId,
      ok: false,
      message: '資料未能寫入試算表，請稍後再試。'
    });
  }
}

function readSubmission_(parameters) {
  const limits = {
    name: 100, phone: 100, contactInfo: 200, relationship: 100,
    diet: 200, attendance: 100, guests: 100, kidsSeats: 100,
    invitation: 200, address: 500, blessings: 2000, remarks: 2000
  };
  const values = {};
  Object.keys(limits).forEach(key => {
    values[key] = clean_(parameters[key], limits[key]);
  });

  const attending = values.attendance === '親自出席，共襄盛舉';
  const needsAddress = values.invitation === '需要，請寄紙本喜帖給我做紀念';
  const required = ['name', 'phone', 'relationship', 'attendance', 'invitation'];
  if (attending) required.push('diet', 'guests');
  else values.diet = values.guests = values.kidsSeats = '';
  if (needsAddress) required.push('address');
  else values.address = '';
  if (values.invitation === '需要，給我電子喜帖就可以囉！') required.push('contactInfo');

  if (required.some(key => !values[key])) {
    throw new Error('請填寫所有必填欄位。');
  }

  // Accept numeric counts and labels from older copies of the website.
  // 接受數字及舊版網站的選項文字；未出席時不儲存餐點。
  const choices = {
    relationship: ['男方家人親戚', '男方長官同事', '男方同學、好友', '女方家人親戚', '女方長官同事', '女方同學、好友'],
    attendance: ['親自出席，共襄盛舉', '無法出席，寄予最深祝福'],
    invitation: ['不用呦！婚宴資訊我知道了', '需要，給我電子喜帖就可以囉！', '需要，請寄紙本喜帖給我做紀念'],
    diet: ['葷食', '素食', '有部分親友吃素 (請於備註說明人數)']
  };
  if (Object.keys(choices).some(key => values[key] && !choices[key].includes(values[key]))) {
    throw new Error('回函包含無效的選項。');
  }

  const legacyGuestLabels = ['1人', '2人', '3人', '4人', '5人以上 (請於備註說明)'];
  if (legacyGuestLabels.includes(values.guests)) {
    values.guests = String(parseInt(values.guests, 10));
  }
  if (attending && (!/^[1-9][0-9]*$/.test(values.guests) || !Number.isSafeInteger(Number(values.guests)))) {
    throw new Error('請輸入有效的出席人數（正整數）。');
  }

  const legacyKidsSeatLabels = ['1張', '2張', '3張以上'];
  if (values.kidsSeats === '不需要') {
    values.kidsSeats = '0';
  } else if (legacyKidsSeatLabels.includes(values.kidsSeats)) {
    values.kidsSeats = String(parseInt(values.kidsSeats, 10));
  }
  if (values.kidsSeats && (!/^(0|[1-9][0-9]*)$/.test(values.kidsSeats) || !Number.isSafeInteger(Number(values.kidsSeats)))) {
    throw new Error('請輸入有效的兒童座椅數（0 或正整數）。');
  }

  // Store counts as numbers; omitted counts and no child seats are zero.
  // 人數及座椅數儲存為數字；未出席、未填或不需要座椅時記為 0。
  values.guests = Number(values.guests);
  values.kidsSeats = Number(values.kidsSeats);
  return values;
}

function getOrCreateSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sheet;
}

function clean_(value, maxLength) {
  const text = String(value || '').trim().slice(0, maxLength);
  // Keep guest input as text so values such as "+886..." cannot become formulas.
  // 將賓客輸入保留為文字，避免「+886...」等內容被當作公式執行。
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function browserResponse_(payload) {
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');
  const html = '<!doctype html><meta charset="utf-8"><script>' +
    // Apps Script wraps this page in its own iframe, so send the result to the wedding site.
    // Apps Script 會將此頁包在自己的 iframe 中，因此將結果傳回最上層的婚禮網站。
    'window.top.postMessage(' + safePayload + ', "*");' +
    '</script>';

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
