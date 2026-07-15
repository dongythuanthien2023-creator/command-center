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
  } else if (action === 'getDuAnQuyB') {
    data = getDuAnQuyBData(config);
  } else if (action === 'getQuyC') {
    data = getQuyCData(config);
  } else if (action === 'getNghiThuc') {
    data = getNghiThucData(config);
  } else {
    data = { error: 'Unknown action' };
  }

  return respond(data, callback);
}

// POST no-cors "bắn và quên" — client không đọc được response, chỉ tin vào lần GET kế tiếp
// để biết chắc thay đổi đã áp dụng hay bị từ chối (vd WIP=1).
function doPost(e) {
  var config = getConfig();
  if (!e.parameter.token || e.parameter.token !== config.token_api) {
    return ContentService.createTextOutput('');
  }

  var action = e.parameter.action;
  if (action === 'setTrangThaiQuyB') {
    setTrangThaiQuyB(e.parameter);
  } else if (action === 'ghiTienDoQuyB') {
    ghiTienDoQuyB(e.parameter);
  } else if (action === 'danhDauVideoQuyC') {
    danhDauVideoQuyC(e.parameter);
  } else if (action === 'nhapKenhStatsQuyC') {
    nhapKenhStatsQuyC(e.parameter);
  } else if (action === 'nopTuanMoi') {
    nopTuanMoi(e.parameter);
  } else if (action === 'nopDongTuan') {
    nopDongTuan(e.parameter);
  } else if (action === 'nopChanDoan') {
    nopChanDoan(e.parameter);
  }

  return ContentService.createTextOutput('');
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

// Đọc DuAn_QuyB + tính trì trệ (Active mà không cập nhật > so_ngay_tri_tre ngày)
function getDuAnQuyBData(config) {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('DuAn_QuyB');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { projects: [], hasActive: false };

  var header = data[0];
  var col = {};
  header.forEach(function (h, i) { col[h] = i; });

  var soNgayTriTre = Number(config.so_ngay_tri_tre) || 4;
  var now = new Date();
  var hasActive = false;
  var projects = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[col.id]) continue;

    var trangThai = row[col.trang_thai];
    var capNhat = row[col.cap_nhat_cuoi];
    var daysSince = capNhat ? Math.floor((now - new Date(capNhat)) / 86400000) : null;
    var triTre = trangThai === 'Active' && daysSince !== null && daysSince > soNgayTriTre;
    if (trangThai === 'Active') hasActive = true;

    projects.push({
      id: row[col.id],
      ten: row[col.ten],
      moTa: row[col.mo_ta],
      trangThai: trangThai,
      buocHienTai: Number(row[col.buoc_hien_tai]) || 0,
      tongBuoc: Number(row[col.tong_buoc]) || 0,
      daysSinceUpdate: daysSince,
      triTre: triTre
    });
  }

  var order = { 'Active': 0, 'Xếp hàng': 1, 'Đóng băng': 2, 'Hoàn thành': 3 };
  projects.sort(function (a, b) { return (order[a.trangThai] ?? 9) - (order[b.trangThai] ?? 9); });

  attachRecentLogs(projects);

  return { projects: projects, hasActive: hasActive, soNgayTriTre: soNgayTriTre };
}

// Gắn 5 dòng nhật ký gần nhất (NhatKy_QuyB) cho từng dự án — hiển thị "chi tiết" dự án Active
function attachRecentLogs(projects) {
  var nhatKySheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('NhatKy_QuyB');
  var nkData = nhatKySheet.getDataRange().getValues();
  var logsByProject = {};

  if (nkData.length > 1) {
    var nkHeader = nkData[0];
    var nkCol = {};
    nkHeader.forEach(function (h, i) { nkCol[h] = i; });

    for (var i = 1; i < nkData.length; i++) {
      var row = nkData[i];
      var pid = row[nkCol.id_du_an];
      if (!pid) continue;
      if (!logsByProject[pid]) logsByProject[pid] = [];
      var ts = row[nkCol.timestamp];
      logsByProject[pid].push({
        timestamp: ts ? new Date(ts).toISOString() : null,
        buoc: row[nkCol.buoc],
        ghiChu: row[nkCol.ghi_chu_mot_dong]
      });
    }
  }

  projects.forEach(function (p) {
    var logs = logsByProject[p.id] || [];
    logs.sort(function (a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
    p.recentLog = logs.slice(0, 5);
  });
}

// WIP=1: từ chối set Active nếu đã có dự án khác đang Active — im lặng bỏ qua (không có kênh trả lỗi vì POST no-cors)
function setTrangThaiQuyB(p) {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('DuAn_QuyB');
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var idCol = header.indexOf('id');
  var trangThaiCol = header.indexOf('trang_thai');
  var capNhatCol = header.indexOf('cap_nhat_cuoi');

  var targetRow = -1;
  var hasOtherActive = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(p.id)) {
      targetRow = i;
    } else if (data[i][trangThaiCol] === 'Active') {
      hasOtherActive = true;
    }
  }
  if (targetRow === -1) return;
  if (p.trangThai === 'Active' && hasOtherActive) return;

  sheet.getRange(targetRow + 1, trangThaiCol + 1).setValue(p.trangThai);
  sheet.getRange(targetRow + 1, capNhatCol + 1).setValue(new Date());
}

// Ghi 1 dòng NhatKy_QuyB + cập nhật bước hiện tại/cập nhật cuối của dự án
function ghiTienDoQuyB(p) {
  var ss = SpreadsheetApp.openById(CC_SHEET_ID);
  var duAnSheet = ss.getSheetByName('DuAn_QuyB');
  var nhatKySheet = ss.getSheetByName('NhatKy_QuyB');

  var data = duAnSheet.getDataRange().getValues();
  var header = data[0];
  var idCol = header.indexOf('id');
  var buocCol = header.indexOf('buoc_hien_tai');
  var capNhatCol = header.indexOf('cap_nhat_cuoi');

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(p.id)) { targetRow = i; break; }
  }
  if (targetRow === -1) return;

  var buocMoi = Number(p.buoc);
  if (isNaN(buocMoi)) buocMoi = data[targetRow][buocCol];

  duAnSheet.getRange(targetRow + 1, buocCol + 1).setValue(buocMoi);
  duAnSheet.getRange(targetRow + 1, capNhatCol + 1).setValue(new Date());
  nhatKySheet.appendRow([new Date(), p.id, buocMoi, p.ghiChu || '']);
}

// Tuần ISO 8601 dạng "YYYY-Www" (tuần bắt đầu Thứ Hai, tuần chứa ngày 4/1 là tuần 01)
function getIsoWeekString(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

// Dịch chuỗi tuần ISO đi ±N tuần — quy về ngày Thứ Năm của tuần đó rồi tính lại
function addWeeksToIso(isoWeekStr, delta) {
  var parts = isoWeekStr.split('-W');
  var year = Number(parts[0]);
  var week = Number(parts[1]);
  var simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  var dow = simple.getUTCDay() || 7;
  var thursday = new Date(simple);
  thursday.setUTCDate(simple.getUTCDate() - dow + 4 + delta * 7);
  return getIsoWeekString(thursday);
}

// Ghi 1 video "1 chạm" — không bắt buộc link, tính sẵn tuần ISO để đếm streak
function danhDauVideoQuyC(p) {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('VideoLog_QuyC');
  var now = new Date();
  sheet.appendRow([now, p.kenh || '', p.link || '', getIsoWeekString(now)]);
}

function nhapKenhStatsQuyC(p) {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('KenhStats_QuyC');
  var now = new Date();
  sheet.appendRow([
    now,
    Number(p.tiktokFollow) || 0,
    Number(p.fb1Follow) || 0,
    Number(p.fb2Follow) || 0,
    Number(p.groupThanhVien) || 0,
    Number(p.cauHoiInbound) || 0
  ]);
}

// Đếm video/tuần, tính streak (số tuần ĐÃ KẾT THÚC liên tiếp đạt chuẩn, tính lùi từ tuần trước tuần hiện tại),
// và số liệu kênh gần nhất + chuỗi cho đường tăng trưởng
function getQuyCData(config) {
  var ss = SpreadsheetApp.openById(CC_SHEET_ID);
  var mucTieu = Number(config.muc_tieu_video_tuan) || 3;
  var now = new Date();
  var currentWeek = getIsoWeekString(now);

  var videoSheet = ss.getSheetByName('VideoLog_QuyC');
  var videoData = videoSheet.getDataRange().getValues();
  var countByWeek = {};
  var recentVideos = [];

  if (videoData.length > 1) {
    var vHeader = videoData[0];
    var vCol = {};
    vHeader.forEach(function (h, i) { vCol[h] = i; });
    for (var i = 1; i < videoData.length; i++) {
      var row = videoData[i];
      var wk = row[vCol.tuan_iso];
      if (!wk) continue;
      countByWeek[wk] = (countByWeek[wk] || 0) + 1;
      var ts = row[vCol.timestamp];
      recentVideos.push({
        timestamp: ts ? new Date(ts).toISOString() : null,
        kenh: row[vCol.kenh],
        link: row[vCol.link],
        tuanIso: wk
      });
    }
  }
  recentVideos.sort(function (a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
  recentVideos = recentVideos.slice(0, 10);

  var currentCount = countByWeek[currentWeek] || 0;

  var streak = 0;
  var cursor = addWeeksToIso(currentWeek, -1);
  while (streak < 260) {
    var c = countByWeek[cursor] || 0;
    if (c < mucTieu) break;
    streak++;
    cursor = addWeeksToIso(cursor, -1);
  }

  var kenhSheet = ss.getSheetByName('KenhStats_QuyC');
  var kenhData = kenhSheet.getDataRange().getValues();
  var kenhRows = [];
  if (kenhData.length > 1) {
    var kHeader = kenhData[0];
    var kCol = {};
    kHeader.forEach(function (h, i) { kCol[h] = i; });
    for (var j = 1; j < kenhData.length; j++) {
      var kr = kenhData[j];
      if (!kr[kCol.ngay]) continue;
      var ngayVal = kr[kCol.ngay];
      kenhRows.push({
        ngay: ngayVal instanceof Date ? ngayVal.toISOString().slice(0, 10) : String(ngayVal),
        tiktokFollow: Number(kr[kCol.tiktok_follow]) || 0,
        fb1Follow: Number(kr[kCol.fb1_follow]) || 0,
        fb2Follow: Number(kr[kCol.fb2_follow]) || 0,
        groupThanhVien: Number(kr[kCol.group_thanhvien]) || 0,
        cauHoiInbound: Number(kr[kCol.cau_hoi_inbound]) || 0
      });
    }
  }
  kenhRows.sort(function (a, b) { return a.ngay.localeCompare(b.ngay); });
  var kenhSeries = kenhRows.slice(-8);
  var kenhLatest = kenhRows.length > 0 ? kenhRows[kenhRows.length - 1] : null;
  var kenhPrev = kenhRows.length > 1 ? kenhRows[kenhRows.length - 2] : null;

  return {
    currentWeek: {
      tuanIso: currentWeek,
      videoCount: currentCount,
      mucTieu: mucTieu,
      dat: currentCount >= mucTieu
    },
    streak: streak,
    recentVideos: recentVideos,
    kenhLatest: kenhLatest,
    kenhPrev: kenhPrev,
    kenhSeries: kenhSeries
  };
}

// Quy đổi tuần ISO về ngày Thứ Hai(1)..Chủ Nhật(7) của tuần đó
function isoWeekToDate(isoWeekStr, dayOfWeek) {
  var parts = isoWeekStr.split('-W');
  var year = Number(parts[0]);
  var week = Number(parts[1]);
  var simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  var dow = simple.getUTCDay() || 7;
  var monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dow + 1);
  var target = new Date(monday);
  target.setUTCDate(monday.getUTCDate() + (dayOfWeek - 1));
  return target;
}

// Ghi/cập nhật 1 khóa CaiDat (dùng cho phanh tự động — không có sẵn hàm ghi trước đó)
function setCaiDatValue(key, value) {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('CaiDat');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function nopTuanMoi(p) {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('NghiThuc');
  var now = new Date();
  sheet.appendRow([getIsoWeekString(now), 'tuanmoi', p.uuTienA || '', p.uuTienB || '', p.uuTienC || '', '', '', '', '', now]);
}

// Ghi #dongtuan + kiểm tra phanh tự động: 2 lần #dongtuan liên tiếp gần nhất đều năng lượng ≤4
// → mục tiêu video về 2, dự án Active tự Đóng băng. Thoát chế độ khi năng lượng ≥6.
function nopDongTuan(p) {
  var ss = SpreadsheetApp.openById(CC_SHEET_ID);
  var sheet = ss.getSheetByName('NghiThuc');
  var now = new Date();
  var nangLuong = Number(p.nangLuong) || 0;

  sheet.appendRow([getIsoWeekString(now), 'dongtuan', '', '', '', Number(p.video) || 0, Number(p.quyBCapNhat) || 0, Number(p.viecMiss) || 0, nangLuong, now]);

  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var col = {};
  header.forEach(function (h, i) { col[h] = i; });

  var dongTuanEntries = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][col.loai] === 'dongtuan') {
      dongTuanEntries.push({ timestamp: data[i][col.timestamp], nangLuong: Number(data[i][col.nang_luong]) || 0 });
    }
  }
  dongTuanEntries.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
  var lastTwo = dongTuanEntries.slice(-2);

  var config = getConfig();
  var dangGiamTai = config.che_do_giam_tai === 'true' || config.che_do_giam_tai === true;

  if (lastTwo.length === 2 && lastTwo[0].nangLuong <= 4 && lastTwo[1].nangLuong <= 4) {
    if (!dangGiamTai) {
      setCaiDatValue('che_do_giam_tai', 'true');
      setCaiDatValue('muc_tieu_video_tuan', 2);
      freezeActiveDuAnQuyB();
    }
  } else if (dangGiamTai && nangLuong >= 6) {
    setCaiDatValue('che_do_giam_tai', 'false');
    setCaiDatValue('muc_tieu_video_tuan', 3);
  }
}

function freezeActiveDuAnQuyB() {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('DuAn_QuyB');
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var trangThaiCol = header.indexOf('trang_thai');
  var capNhatCol = header.indexOf('cap_nhat_cuoi');
  for (var i = 1; i < data.length; i++) {
    if (data[i][trangThaiCol] === 'Active') {
      sheet.getRange(i + 1, trangThaiCol + 1).setValue('Đóng băng');
      sheet.getRange(i + 1, capNhatCol + 1).setValue(new Date());
    }
  }
}

// Câu trả lời 1 dòng khi banner "Hệ thống hỏng ở đâu?" xuất hiện — mượn cột uu_tien_A (loai khác 'tuanmoi' nên không đụng dữ liệu #tuanmoi)
function nopChanDoan(p) {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('NghiThuc');
  var now = new Date();
  sheet.appendRow([getIsoWeekString(now), 'chan_doan', p.traLoi || '', '', '', '', '', '', '', now]);
}

// So các mốc #tuanmoi (kỳ vọng Thứ Hai) và #dongtuan (kỳ vọng Thứ Sáu) đã QUA HẠN — 2 mốc liên tiếp gần nhất
// đều chưa nộp thì coi là miss-streak, trừ khi đã có câu trả lời #chan_doan sau mốc miss thứ 2.
// Chỉ tính các mốc SAU lần dùng nghi thức đầu tiên (earliestEntryDate) — tránh báo miss oan cho các tuần
// trước khi tính năng này tồn tại/được dùng lần đầu.
function computeMissStreak(tuanmoiWeeks, dongtuanWeeks, chanDoanTimestamps, currentWeek, now, earliestEntryDate) {
  if (!earliestEntryDate) return false;

  var weeksList = [currentWeek];
  var cursor = currentWeek;
  for (var k = 0; k < 8; k++) {
    cursor = addWeeksToIso(cursor, -1);
    weeksList.push(cursor);
  }
  weeksList.reverse();

  var events = [];
  weeksList.forEach(function (wk) {
    var mondayDate = isoWeekToDate(wk, 1);
    var fridayDate = isoWeekToDate(wk, 5);
    if (mondayDate <= now && mondayDate >= earliestEntryDate) events.push({ type: 'tuanmoi', week: wk, date: mondayDate, done: tuanmoiWeeks.indexOf(wk) !== -1 });
    if (fridayDate <= now && fridayDate >= earliestEntryDate) events.push({ type: 'dongtuan', week: wk, date: fridayDate, done: dongtuanWeeks.indexOf(wk) !== -1 });
  });
  events.sort(function (a, b) { return a.date - b.date; });

  var lastTwo = events.slice(-2);
  var rawMiss = lastTwo.length === 2 && !lastTwo[0].done && !lastTwo[1].done;
  if (!rawMiss) return false;

  var secondMissDate = lastTwo[1].date;
  var resolved = chanDoanTimestamps.some(function (ts) { return ts && new Date(ts) > secondMissDate; });
  return !resolved;
}

function getNghiThucData(config) {
  var sheet = SpreadsheetApp.openById(CC_SHEET_ID).getSheetByName('NghiThuc');
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var currentWeek = getIsoWeekString(now);

  var tuanmoiWeeks = [];
  var dongtuanWeeks = [];
  var chanDoanTimestamps = [];
  var energySeries = [];
  var lastTuanMoi = null;
  var lastDongTuan = null;
  var earliestEntryDate = null;

  if (data.length > 1) {
    var header = data[0];
    var col = {};
    header.forEach(function (h, i) { col[h] = i; });

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var loai = row[col.loai];
      var wk = row[col.tuan_iso];
      var rowTs = row[col.timestamp] ? new Date(row[col.timestamp]) : null;
      if (rowTs && (!earliestEntryDate || rowTs < earliestEntryDate)) earliestEntryDate = rowTs;

      if (loai === 'tuanmoi') {
        tuanmoiWeeks.push(wk);
        if (!lastTuanMoi || wk > lastTuanMoi.week) {
          lastTuanMoi = { week: wk, uuTienA: row[col.uu_tien_A], uuTienB: row[col.uu_tien_B], uuTienC: row[col.uu_tien_C] };
        }
      } else if (loai === 'dongtuan') {
        dongtuanWeeks.push(wk);
        var nl = Number(row[col.nang_luong]) || 0;
        energySeries.push({
          week: wk,
          nangLuong: nl,
          timestamp: row[col.timestamp] ? new Date(row[col.timestamp]).toISOString() : null
        });
        if (!lastDongTuan || wk > lastDongTuan.week) {
          lastDongTuan = {
            week: wk,
            video: Number(row[col.video_dat]) || 0,
            quyBCapNhat: Number(row[col.quyB_capnhat]) || 0,
            viecMiss: Number(row[col.viec_miss]) || 0,
            nangLuong: nl
          };
        }
      } else if (loai === 'chan_doan') {
        chanDoanTimestamps.push(row[col.timestamp]);
      }
    }
  }

  energySeries.sort(function (a, b) { return (a.week || '').localeCompare(b.week || ''); });
  energySeries = energySeries.slice(-10);

  var missStreak = computeMissStreak(tuanmoiWeeks, dongtuanWeeks, chanDoanTimestamps, currentWeek, now, earliestEntryDate);

  return {
    currentWeek: currentWeek,
    tuanMoiDoneThisWeek: tuanmoiWeeks.indexOf(currentWeek) !== -1,
    dongTuanDoneThisWeek: dongtuanWeeks.indexOf(currentWeek) !== -1,
    lastTuanMoi: lastTuanMoi,
    lastDongTuan: lastDongTuan,
    energySeries: energySeries,
    nguongNangLuong: 4,
    dangGiamTai: config.che_do_giam_tai === 'true' || config.che_do_giam_tai === true,
    missStreak: missStreak
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

// ── Telegram — nhắc lịch (CLAUDE.md mục "Nhắc nhở") ────────────────────────
// Trigger cài qua setupTriggers() (setup.gs, chạy tay 1 lần). Token/chat_id CHỈ đọc từ CaiDat,
// không hardcode (CLAUDE.md — bảo mật). Không dùng parse_mode để khỏi phải escape ký tự đặc biệt
// trong tên dự án/nhóm campaign do người dùng đặt.
function sendTelegram(text) {
  var config = getConfig();
  var token = config.telegram_bot_token;
  var chatId = config.telegram_chat_id;
  if (!token || !chatId) {
    Logger.log('Chưa cấu hình telegram_bot_token/telegram_chat_id trong CaiDat — bỏ qua gửi: ' + text);
    return;
  }
  // Gửi qua query string thay vì payload object — tránh phụ thuộc cách UrlFetchApp tự đóng gói
  // multipart/form-urlencoded cho payload dạng object (từng gây "chat not found" dù token/chat_id đúng).
  var url = 'https://api.telegram.org/bot' + token + '/sendMessage'
    + '?chat_id=' + encodeURIComponent(chatId)
    + '&text=' + encodeURIComponent(text);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    Logger.log('Telegram lỗi ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

function formatDateKey(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// Gửi tối đa 1 lần/ngày cho mỗi khóa cảnh báo — chống spam khi checkEventAlerts chạy mỗi giờ
// mà điều kiện vẫn còn đúng suốt cả ngày (vd dự án vẫn trì trệ ở lần kiểm tra kế tiếp).
function alertOnce(key, text) {
  var props = PropertiesService.getScriptProperties();
  var fullKey = 'alert_' + key + '_' + formatDateKey(new Date());
  if (props.getProperty(fullKey)) return;
  sendTelegram(text);
  props.setProperty(fullKey, '1');
}

// 08:00 hằng ngày — tóm tắt Ads hôm qua + cảnh báo + trạng thái dự án Quỹ B Active
function sendMorningSummary() {
  var config = getConfig();
  var ads = computeAdsData(config);
  var duAn = getDuAnQuyBData(config);

  var lines = ['☀️ Tóm tắt sáng'];
  if (ads.error) {
    lines.push('Ads: ' + ads.error);
  } else {
    lines.push('Ads ' + ads.adsDate + ': ' + formatVnd(ads.today.chiPhi) + 'đ · CPC ' +
      (ads.today.cpc !== null ? formatVnd(ads.today.cpc) + 'đ' : '–') + ' · CTR ' +
      (ads.today.ctr !== null ? ads.today.ctr.toFixed(2) + '%' : '–'));
    if (ads.warnings && ads.warnings.length > 0) {
      lines.push('⚠️ ' + ads.warnings.join(' | '));
    }
  }

  var active = duAn.projects.filter(function (p) { return p.trangThai === 'Active'; })[0];
  if (active) {
    lines.push('Quỹ B Active: ' + active.ten + ' (bước ' + active.buocHienTai + '/' + active.tongBuoc + ')' +
      (active.triTre ? ' — TRÌ TRỆ ' + active.daysSinceUpdate + ' ngày' : ''));
  } else {
    lines.push('Quỹ B: không có dự án Active');
  }

  sendTelegram(lines.join('\n'));
}

// 19:00 hằng ngày — nhắc phiên content + hỏi tiến độ Quỹ B
function sendEveningReminder() {
  sendTelegram('🌙 19:00 — phiên content hôm nay đã xong chưa? Quỹ B hôm nay tiến được gì? Mở app ghi lại nhé.');
}

// Thứ Hai 08:30 — nhắc #tuanmoi + số liệu #dongtuan tuần trước để tham chiếu
function sendTuanMoiReminder() {
  var config = getConfig();
  var nghiThuc = getNghiThucData(config);
  var lines = ['🗓️ Thứ Hai — nộp #tuanmoi (3 ưu tiên A/B/C tuần này).'];
  if (nghiThuc.lastDongTuan) {
    var lt = nghiThuc.lastDongTuan;
    lines.push('Tuần trước: ' + lt.video + ' video · ' + lt.quyBCapNhat + ' lần cập nhật Quỹ B · ' +
      lt.viecMiss + ' việc miss · năng lượng ' + lt.nangLuong + '/10.');
  }
  sendTelegram(lines.join('\n'));
}

// Thứ Sáu 20:00 — nhắc #dongtuan
function sendDongTuanReminder() {
  sendTelegram('🗓️ Thứ Sáu — nộp #dongtuan (video, lần cập nhật Quỹ B, việc miss, năng lượng 1–10).');
}

// Chủ Nhật 20:00 — nhắc nhập số liệu kênh Quỹ C
function sendKenhStatsReminder() {
  sendTelegram('📊 Chủ Nhật — nhập số liệu kênh Quỹ C (follow TikTok/FB1/FB2, group, câu hỏi inbound).');
}

// Theo sự kiện (chạy mỗi giờ qua trigger): CPC lệch nhóm ≥20% so MA7 (ngưỡng đồng bộ với UI —
// index.html buildInsight), dự án Active trì trệ > so_ngay_tri_tre ngày, CRM quá hạn > nguong_qua_han,
// vi phạm SLA > 0. Mỗi điều kiện tối đa 1 tin/ngày (alertOnce).
function checkEventAlerts() {
  var config = getConfig();

  var ads = computeAdsData(config);
  if (!ads.error) {
    Object.keys(ads.groups).forEach(function (name) {
      var g = ads.groups[name];
      if (g.eligible && g.deltaPct !== null && Math.abs(g.deltaPct) >= 20) {
        var dir = g.deltaPct > 0 ? 'tăng' : 'giảm';
        alertOnce('cpc_' + name, '📈 CPC nhóm ' + name + ' ' + dir + ' ' + Math.abs(Math.round(g.deltaPct)) + '% so MA7.');
      }
    });
  }

  var duAn = getDuAnQuyBData(config);
  duAn.projects.forEach(function (p) {
    if (p.triTre) {
      alertOnce('trice_' + p.id, '🧊 Dự án "' + p.ten + '" trì trệ ' + p.daysSinceUpdate + ' ngày (chưa cập nhật).');
    }
  });

  var crm = proxyCrm('getDashboardData', {}, config.crm_webapp_url);
  if (crm && !crm.error) {
    var nguongQuaHan = Number(config.nguong_qua_han) || 10;
    if (Number(crm.totalOverdue) > nguongQuaHan) {
      alertOnce('quahan', '⏰ CRM có ' + crm.totalOverdue + ' liên hệ quá hạn (ngưỡng ' + nguongQuaHan + ').');
    }
    if (Number(crm.totalViPham) > 0) {
      alertOnce('vipham', '🚨 CRM có ' + crm.totalViPham + ' vi phạm SLA đang chờ xử lý.');
    }
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

