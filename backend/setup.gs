// Command Center — script setup/khảo sát một lần (chạy tay từ Apps Script editor)

var CC_SHEET_ID = '1SMvxCXdPZcKrpMSTJpv4-OpoD2G8lUKTA70sdBMM9Mo';
var ADS_SHEET_ID = '1mTLWk3qig3sdC9MhRRPO72Xj2oavyF_niuNonnCBvbk';
var CRM_SHEET_ID = '1okp3LAwCCLSM8mycfPWRMF-78aS4O7wkQtPakGLcsfM';

// Schema theo SPEC.md mục 7
var SCHEMAS = {
  'DuAn_QuyB': ['id', 'ten', 'mo_ta', 'trang_thai', 'buoc_hien_tai', 'tong_buoc', 'ngay_tao', 'cap_nhat_cuoi'],
  'NhatKy_QuyB': ['timestamp', 'id_du_an', 'buoc', 'ghi_chu_mot_dong'],
  'VideoLog_QuyC': ['timestamp', 'kenh', 'link', 'tuan_iso'],
  'KenhStats_QuyC': ['ngay', 'tiktok_follow', 'fb1_follow', 'fb2_follow', 'group_thanhvien', 'cau_hoi_inbound'],
  'NghiThuc': ['tuan_iso', 'loai', 'uu_tien_A', 'uu_tien_B', 'uu_tien_C', 'video_dat', 'quyB_capnhat', 'viec_miss', 'nang_luong', 'timestamp'],
  'CaiDat': ['khoa', 'gia_tri']
};

// Giá trị mặc định CaiDat — token/chat_id/URL để trống, tự điền tay sau
var CAIDAT_DEFAULTS = [
  ['token_api', ''],
  ['telegram_bot_token', ''],
  ['telegram_chat_id', ''],
  ['ngan_sach_thang', ''],
  ['chi_phi_ngay_full', 1000000],
  ['nguong_ngay_don', 1200000],
  ['so_ngay_tri_tre', 4],
  ['muc_tieu_video_tuan', 3],
  ['nguong_qua_han', 10],
  ['ads_sheet_id', ADS_SHEET_ID],
  ['crm_sheet_id', CRM_SHEET_ID],
  ['crm_webapp_url', '']
];

function setupSheets() {
  var ss = SpreadsheetApp.openById(CC_SHEET_ID);

  Object.keys(SCHEMAS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = SCHEMAS[name];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  });

  seedCaiDat(ss.getSheetByName('CaiDat'));
  seedDuAnQuyB(ss.getSheetByName('DuAn_QuyB'));

  // Dọn sheet mặc định "Sheet1" nếu còn trống và không thuộc schema
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  Logger.log('Đã tạo/cập nhật ' + Object.keys(SCHEMAS).length + ' tab trong Sheet Command Center.');
}

// Chỉ thêm khóa còn thiếu — không ghi đè token/URL đã điền tay
function seedCaiDat(sheet) {
  var lastRow = sheet.getLastRow();
  var existingKeys = {};
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (row) {
      existingKeys[row[0]] = true;
    });
  }

  var toAppend = CAIDAT_DEFAULTS.filter(function (pair) {
    return !existingKeys[pair[0]];
  });

  if (toAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 2).setValues(toAppend);
  }
}

// Khởi tạo 5 dự án Quỹ B theo SPEC.md §4.2 — chỉ thêm dự án còn thiếu (theo tên), không ghi đè tiến độ đã có
function seedDuAnQuyB(sheet) {
  var lastRow = sheet.getLastRow();
  var existingNames = {};
  if (lastRow > 1) {
    sheet.getRange(2, 2, lastRow - 1, 1).getValues().forEach(function (row) {
      existingNames[row[0]] = true;
    });
  }

  var now = new Date();
  var duAnMacDinh = [
    ['qb-command-center', 'Command Center', 'PWA cá nhân gộp Genkii/Tài sản/Thương hiệu/Nghi thức', 'Active', 0, 10, now, now],
    ['qb-compliance-engine', 'Compliance engine', '', 'Xếp hàng', 0, 10, now, now],
    ['qb-protocol-yhct-bes', 'Protocol YHCT BES', '', 'Xếp hàng', 0, 10, now, now],
    ['qb-knowledge-base-yhct', 'Knowledge base YHCT', '', 'Xếp hàng', 0, 10, now, now],
    ['qb-tracking-158-seo', 'Tracking 158 bài SEO', '', 'Xếp hàng', 0, 10, now, now]
  ];

  var toAppend = duAnMacDinh.filter(function (p) { return !existingNames[p[1]]; });
  if (toAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 8).setValues(toAppend);
  }
}

// Cài 6 trigger nhắc lịch Telegram (CLAUDE.md mục "Nhắc nhở") — chạy TAY 1 lần từ Apps Script editor
// sau khi đã điền telegram_bot_token/telegram_chat_id vào CaiDat. An toàn chạy lại nhiều lần (xóa trigger
// cũ cùng tên trước khi tạo lại) nếu cần đổi giờ. Giờ chạy theo múi giờ script — kiểm tra
// Project Settings → múi giờ = Asia/Ho_Chi_Minh trước khi tin giờ trigger nổ đúng.
function setupTriggers() {
  var handlers = ['sendMorningSummary', 'sendEveningReminder', 'sendTuanMoiReminder', 'sendDongTuanReminder', 'sendKenhStatsReminder', 'checkEventAlerts'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('sendMorningSummary').timeBased().atHour(8).nearMinute(0).everyDays(1).create();
  ScriptApp.newTrigger('sendEveningReminder').timeBased().atHour(19).nearMinute(0).everyDays(1).create();
  ScriptApp.newTrigger('sendTuanMoiReminder').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).nearMinute(30).create();
  ScriptApp.newTrigger('sendDongTuanReminder').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(20).nearMinute(0).create();
  ScriptApp.newTrigger('sendKenhStatsReminder').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(20).nearMinute(0).create();
  ScriptApp.newTrigger('checkEventAlerts').timeBased().everyHours(1).create();

  Logger.log('Đã cài ' + handlers.length + ' trigger nhắc lịch Telegram.');
}

function khaoSat() {
  var crm = SpreadsheetApp.openById(CRM_SHEET_ID);
  logSheetSample(crm, 'Thống kê lượt ngày', 3);
  logSheetSample(crm, 'Lịch sử liên hệ', 3);
}

// Khảo sát Sheet Ads: cấu trúc cột thật + tên campaign thật (để đối chiếu pattern phân nhóm trong CLAUDE.md)
function khaoSatAds() {
  var ss = SpreadsheetApp.openById(ADS_SHEET_ID);
  var sheet = ss.getSheets()[0];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  Logger.log('--- Sheet Ads: "' + sheet.getName() + '" (' + lastRow + ' dòng x ' + lastCol + ' cột) ---');

  var headRows = Math.min(3, lastRow);
  sheet.getRange(1, 1, headRows, lastCol).getValues().forEach(function (row, i) {
    Logger.log('Đầu — dòng ' + (i + 1) + ': ' + JSON.stringify(row));
  });

  var tailCount = Math.min(15, Math.max(0, lastRow - 1));
  if (tailCount > 0) {
    var startRow = lastRow - tailCount + 1;
    sheet.getRange(startRow, 1, tailCount, lastCol).getValues().forEach(function (row, i) {
      Logger.log('Cuối — dòng ' + (startRow + i) + ': ' + JSON.stringify(row));
    });
  }

  if (lastRow > 1) {
    var campaignValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var distinct = {};
    campaignValues.forEach(function (row) { distinct[row[0]] = true; });
    var names = Object.keys(distinct);
    Logger.log('--- Campaign duy nhất (' + names.length + ') ---');
    names.forEach(function (name) { Logger.log('· ' + name); });
  }
}

function logSheetSample(ss, sheetName, numRows) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log('Không tìm thấy tab: ' + sheetName);
    return;
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  Logger.log('--- ' + sheetName + ' (' + lastRow + ' dòng x ' + lastCol + ' cột) ---');

  var rows = Math.min(numRows, lastRow);
  if (rows === 0) {
    Logger.log('(trống)');
    return;
  }

  sheet.getRange(1, 1, rows, lastCol).getValues().forEach(function (row, i) {
    Logger.log('Dòng ' + (i + 1) + ': ' + JSON.stringify(row));
  });
}
