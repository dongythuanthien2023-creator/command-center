// Command Center — Apps Script backend (gắn Sheet "Command Center")
// CC_SHEET_ID khai báo tại setup.gs (cùng project Apps Script)

// Các action đọc-only proxy sang CRM Web App (nguyên tắc "một nguồn logic duy nhất" — CLAUDE.md)
var CRM_ACTIONS = ['getDashboardData', 'getCostStats', 'getLuotRange', 'getSourceRange'];

function doGet(e) {
  var config = getConfig();
  var callback = e.parameter.callback;
  var token = e.parameter.token;

  if (!token || token !== config.token_api) {
    return respond({ error: 'Thiếu hoặc sai token' }, callback);
  }

  var action = e.parameter.action;
  var data;

  if (CRM_ACTIONS.indexOf(action) !== -1) {
    data = proxyCrm(action, e.parameter, config.crm_webapp_url);
  } else {
    data = { error: 'Unknown action' };
  }

  return respond(data, callback);
}

// Gọi CRM Web App từ server (không kèm callback — server-to-server không bị CORS),
// forward nguyên JSON trả về. doGet của CRM không xác thực token nên chỉ cần đúng action + params.
function proxyCrm(action, params, crmUrl) {
  if (!crmUrl) {
    return { error: 'Chưa cấu hình crm_webapp_url trong CaiDat' };
  }

  var url = crmUrl + '?action=' + encodeURIComponent(action);
  ['from', 'to', 'fresh'].forEach(function (key) {
    if (params[key] !== undefined) {
      url += '&' + key + '=' + encodeURIComponent(params[key]);
    }
  });

  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    return { error: 'CRM trả lỗi HTTP ' + res.getResponseCode() };
  }

  try {
    return JSON.parse(res.getContentText());
  } catch (err) {
    return { error: 'CRM trả dữ liệu không hợp lệ' };
  }
}

function respond(data, callback) {
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(data) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getConfig() {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('CaiDat');
  var lastRow = sheet.getLastRow();
  var config = {};
  if (lastRow < 2) return config;

  sheet.getRange(2, 1, lastRow - 1, 2).getValues().forEach(function (row) {
    config[row[0]] = row[1];
  });
  return config;
}

// TODO: doPost (no-cors) — ghi DuAn_QuyB/NhatKy_QuyB/VideoLog_QuyC/KenhStats_QuyC/NghiThuc
