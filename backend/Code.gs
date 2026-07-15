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
  } else if (action === 'getAdsToday') {
    data = computeAdsData(config);
  } else {
    data = { error: 'Unknown action' };
  }

  return respond(data, callback);
}

// Phân nhóm campaign theo pattern tên (CLAUDE.md) — ưu tiên "Genkii Hub" trước
// vì có campaign vừa khớp tiền tố "Tương tác" vừa chứa "Genkii Hub" (quyết định 15/07/2026)
function classifyCampaign(name) {
  if (name === 'Không có campaign') return null;
  if (name.indexOf('Genkii Hub') !== -1) return 'Hub B2B';
  if (name.indexOf('Ads chuyển đổi') === 0 && name.indexOf('BES') !== -1) return 'Chuyển đổi BES';
  if (name.indexOf('Tương tác') === 0) return 'Tương tác';
  if (name.indexOf('Retargeting') === 0) return 'Retargeting';
  return 'Chưa phân loại';
}

function formatVnd(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Đọc trực tiếp Sheet Ads (tab "Daily": Ngày|Campaign|Chi phí|Impressions|Clicks|CTR|CPC — cột số lưu dạng text).
// Quy tắc xử lý theo CLAUDE.md: loại "Không có campaign" khỏi trung bình, benchmark nhóm chỉ bật sau ≥5 ngày active,
// cảnh báo theo lệch MA7 của nhóm (không so hôm qua).
function computeAdsData(config) {
  var sheetId = config.ads_sheet_id;
  if (!sheetId) return { error: 'Chưa cấu hình ads_sheet_id trong CaiDat' };

  var sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { error: 'Sheet Ads chưa có dữ liệu' };

  var raw = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var chiPhiNgayFull = Number(config.chi_phi_ngay_full) || 1000000;
  var nguongNgayDon = Number(config.nguong_ngay_don) || 1200000;

  // Parse + khử trùng lặp theo (ngày, campaign) — giữ dòng xuất hiện trước
  var seen = {};
  var rows = [];
  raw.forEach(function (r) {
    var date = String(r[0]);
    var campaign = String(r[1]);
    var key = date + '|' + campaign;
    if (seen[key]) return;
    seen[key] = true;
    rows.push({
      date: date,
      campaign: campaign,
      chiPhi: Number(r[2]) || 0,
      impressions: Number(r[3]) || 0,
      clicks: Number(r[4]) || 0
    });
  });
  if (rows.length === 0) return { error: 'Không parse được dữ liệu Ads' };

  var latestDate = rows.reduce(function (max, r) { return r.date > max ? r.date : max; }, rows[0].date);

  var unclassified = {};
  var byGroup = {};
  var byDate = {};
  var byCampaign = {};

  rows.forEach(function (r) {
    if (!byDate[r.date]) byDate[r.date] = 0;
    byDate[r.date] += r.chiPhi;

    if (r.campaign === 'Không có campaign') return;

    var group = classifyCampaign(r.campaign);
    if (group === 'Chưa phân loại') unclassified[r.campaign] = true;
    if (!byGroup[group]) byGroup[group] = [];
    byGroup[group].push(r);

    if (!byCampaign[r.campaign]) byCampaign[r.campaign] = [];
    byCampaign[r.campaign].push(r);
  });

  // Cảnh báo: 2 ngày liên tiếp số liệu giống hệt nhau ở cùng 1 campaign (nghi trùng lặp/lỗi ghi báo cáo)
  var duplicateWarnings = [];
  Object.keys(byCampaign).forEach(function (name) {
    var list = byCampaign[name].slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    for (var i = 1; i < list.length; i++) {
      var a = list[i - 1], b = list[i];
      if (a.chiPhi > 0 && a.chiPhi === b.chiPhi && a.impressions === b.impressions && a.clicks === b.clicks) {
        duplicateWarnings.push(name + ' — ' + a.date + ' & ' + b.date + ' số liệu giống hệt nhau');
      }
    }
  });

  function groupStats(list) {
    var byDateInGroup = {};
    list.forEach(function (r) {
      if (!byDateInGroup[r.date]) byDateInGroup[r.date] = { chiPhi: 0, impressions: 0, clicks: 0 };
      byDateInGroup[r.date].chiPhi += r.chiPhi;
      byDateInGroup[r.date].impressions += r.impressions;
      byDateInGroup[r.date].clicks += r.clicks;
    });
    var dates = Object.keys(byDateInGroup).sort();
    var activeDays = dates.length;
    var todayStat = byDateInGroup[latestDate] || { chiPhi: 0, impressions: 0, clicks: 0 };
    var todayCpc = todayStat.clicks > 0 ? todayStat.chiPhi / todayStat.clicks : null;

    var last7 = dates.filter(function (d) { return d !== latestDate; }).slice(-7);
    var sumChiPhi = 0, sumClicks = 0;
    last7.forEach(function (d) {
      sumChiPhi += byDateInGroup[d].chiPhi;
      sumClicks += byDateInGroup[d].clicks;
    });
    var ma7Cpc = sumClicks > 0 ? sumChiPhi / sumClicks : null;

    var eligible = activeDays >= 5; // benchmark/cảnh báo chỉ bật sau ≥5 ngày active
    var deltaPct = (eligible && ma7Cpc && todayCpc !== null) ? ((todayCpc - ma7Cpc) / ma7Cpc) * 100 : null;

    return {
      activeDays: activeDays,
      todayChiPhi: todayStat.chiPhi,
      todayClicks: todayStat.clicks,
      todayCpc: todayCpc,
      ma7Cpc: ma7Cpc,
      eligible: eligible,
      deltaPct: deltaPct
    };
  }

  var groups = {};
  ['Chuyển đổi BES', 'Tương tác', 'Retargeting', 'Hub B2B'].forEach(function (g) {
    groups[g] = groupStats(byGroup[g] || []);
  });

  // Tổng toàn account — loại ngày "Không có campaign" khỏi trung bình MA7 (giữ trong nhịp ngân sách riêng bên dưới)
  var allRealRows = rows.filter(function (r) { return r.campaign !== 'Không có campaign'; });
  var byDateAll = {};
  allRealRows.forEach(function (r) {
    if (!byDateAll[r.date]) byDateAll[r.date] = { chiPhi: 0, impressions: 0, clicks: 0 };
    byDateAll[r.date].chiPhi += r.chiPhi;
    byDateAll[r.date].impressions += r.impressions;
    byDateAll[r.date].clicks += r.clicks;
  });
  var allDates = Object.keys(byDateAll).sort();
  var todayAll = byDateAll[latestDate] || { chiPhi: 0, impressions: 0, clicks: 0 };
  var last14 = allDates.slice(-14);
  var last7All = allDates.filter(function (d) { return d !== latestDate; }).slice(-7);
  var sumChiPhiAll = 0, sumClicksAll = 0, sumImprAll = 0;
  last7All.forEach(function (d) {
    sumChiPhiAll += byDateAll[d].chiPhi;
    sumClicksAll += byDateAll[d].clicks;
    sumImprAll += byDateAll[d].impressions;
  });

  var today = {
    date: latestDate,
    chiPhi: todayAll.chiPhi,
    impressions: todayAll.impressions,
    clicks: todayAll.clicks,
    ctr: todayAll.impressions > 0 ? (todayAll.clicks / todayAll.impressions) * 100 : null,
    cpc: todayAll.clicks > 0 ? todayAll.chiPhi / todayAll.clicks : null,
    cpm: todayAll.impressions > 0 ? (todayAll.chiPhi / todayAll.impressions) * 1000 : null
  };
  var ma7 = {
    chiPhi: last7All.length > 0 ? sumChiPhiAll / last7All.length : null,
    cpc: sumClicksAll > 0 ? sumChiPhiAll / sumClicksAll : null,
    ctr: sumImprAll > 0 ? (sumClicksAll / sumImprAll) * 100 : null
  };

  // Nhịp ngân sách tháng (theo tháng của ngày dữ liệu gần nhất) = số ngày thực chạy × chi_phi_ngay_full
  var monthPrefix = latestDate.slice(0, 7);
  var monthDaysRun = 0, monthSpend = 0;
  Object.keys(byDate).forEach(function (d) {
    if (d.indexOf(monthPrefix) === 0) {
      monthSpend += byDate[d];
      if (byDate[d] > 0) monthDaysRun++;
    }
  });

  var warnings = [];
  if (today.chiPhi > nguongNgayDon) {
    warnings.push('Chi phí hôm qua (' + formatVnd(today.chiPhi) + 'đ) vượt ngưỡng ' + formatVnd(nguongNgayDon) + 'đ');
  }
  warnings = warnings.concat(duplicateWarnings);

  return {
    // "today" = ngày dữ liệu Ads gần nhất trong Sheet — vì báo cáo chỉ ghi 1 lần ~2h sáng
    // cho ngày liền trước, nên đây luôn là "hôm qua" thực tế, không phải hôm nay live
    adsDate: latestDate,
    today: today,
    ma7: ma7,
    daily: last14.map(function (d) { return { date: d, chiPhi: byDateAll[d].chiPhi }; }),
    groups: groups,
    budget: {
      monthDaysRun: monthDaysRun,
      monthSpend: monthSpend,
      monthPaceTarget: monthDaysRun * chiPhiNgayFull,
      chiPhiNgayFull: chiPhiNgayFull
    },
    unclassified: Object.keys(unclassified),
    warnings: warnings
  };
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
