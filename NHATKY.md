# NHATKY.md — Nhật ký phiên làm việc

> File này tóm lược bối cảnh cuộc trò chuyện giữa Thôi và Claude qua từng phiên — để phiên làm việc mới (máy khác, hoặc ngày khác) đọc và nối tiếp mạch mà không cần giải thích lại từ đầu.
> Cách dùng: đầu phiên mới, nói với Claude "đọc NHATKY.md trước khi làm gì" (hoặc Claude tự đọc nếu được nhắc bối cảnh dự án). Cuối phiên, cập nhật lại mục **"Trạng thái mới nhất"** + thêm 1 mục vào **"Lịch sử phiên"**.
> Quyết định kỹ thuật *lâu dài* (không đổi theo phiên) nằm trong `CLAUDE.md`, không lặp lại ở đây.

---

## Trạng thái mới nhất (cập nhật 15/07/2026, đêm)

**v1 theo SPEC.md coi như hoàn thiện toàn bộ — cả 4 tab + Telegram bot + nút Hỏi Claude, đã test qua trình duyệt/Playwright:**
- **Tab Genkii:** Tầng 1 Ads (chi phí/CPM/CTR/CPC hôm qua, MA7, benchmark 4 nhóm, nhịp ngân sách tháng) + Tầng 2 CRM (khách mới, phễu giai đoạn, nguồn lead, hoạt động Sales, quá hạn/vi phạm SLA) — dữ liệu thật 100%
- **Tab Tài sản:** WIP=1 (backend từ chối set Active thứ 2), nút "+ Tiến độ", nhật ký gần đây, cảnh báo trì trệ >4 ngày
- **Tab Thương hiệu cá nhân:** đếm video/tuần, streak (tuần đã kết thúc liên tiếp đạt chuẩn), đánh dấu 1 chạm (TikTok/FB1/FB2), nhập số liệu kênh
- **Tab Nghi thức:** form #tuanmoi/#dongtuan, biểu đồ năng lượng, phanh tự động giảm tải (2 tuần ≤4 → video mục tiêu về 2 + Quỹ B Đóng băng), banner "Hệ thống hỏng ở đâu?" khi miss 2 mốc liên tiếp
- **Telegram bot nhắc lịch:** 6 trigger (08:00 sáng, 19:00 tối, T2 08:30 #tuanmoi, T6 20:00 #dongtuan, CN 20:00 số liệu kênh, mỗi giờ kiểm tra cảnh báo sự kiện — CPC lệch nhóm ≥20%, dự án trì trệ, CRM quá hạn >10, vi phạm SLA), chống spam 1 tin/ngày/điều kiện
- **Nút "Hỏi Claude" (SPEC mục 6):** 13 nút trên các khối có số liệu đáng phân tích ở cả 4 tab, copy prompt kèm số liệu hiện tại vào clipboard

**Hạ tầng:**
- Repo: `https://github.com/dongythuanthien2023-creator/command-center` (public, nhánh `main`)
- Backend: Apps Script gắn Sheet "Command Center" (2 file: `Code.gs`, `setup.gs`), deploy dạng Web App — **mỗi lần sửa Code.gs phải Triển khai → Phiên bản mới** thủ công, không tự động
- Frontend: GitHub Pages, PWA cài được lên điện thoại, Service Worker network-first (tự cập nhật khi mở lại app có mạng)
- Thương hiệu: "HayLaThoi Center", theme dark luxury (đen + nhũ đồng) 1 bản duy nhất, icon PWA tự vẽ (sao 4 cánh, dùng Python/Pillow vì máy không có ImageMagick)
- CaiDat có thêm khóa `nguong_qua_han` (mặc định 10 liên hệ quá hạn cùng lúc — ngưỡng cảnh báo bot Telegram, chỉnh được)
- Bot Telegram: `HayLaThoiCommandBot`, đã xác nhận gửi tin thật thành công tới chat_id của Thôi

**Chưa làm (theo SPEC, không phải lỗi):**
- ROAS thô tháng — đang chờ Thôi nhập kỷ luật cột "Giá Trị" ở deal Chốt bên CRM (không phải việc của code)

**Việc đang dở / cần quyết định tiếp (nếu có):** không có, mọi câu hỏi mở đã được chốt trong phiên này.

---

## Lịch sử phiên

### 14–15/07/2026 — Khởi tạo dự án đến hoàn thiện v1
- Ngày 1: khởi tạo repo, đọc CLAUDE.md/SPEC.md, tạo cấu trúc file cơ bản, khảo sát cấu trúc thật Sheet CRM (`Thống kê lượt ngày`, `Lịch sử liên hệ`) bằng `khaoSat()`
- Xây backend proxy (`Code.gs`) gọi CRM Web App có sẵn (không viết lại logic), xác thực bằng `token_api` trong CaiDat
- Xây khung PWA 4 tab, deploy GitHub Pages, cài thử lên điện thoại — phát hiện & sửa lỗi Service Worker cache-first khiến điện thoại không nhận bản mới
- Thiết kế lại UI/UX theo hướng "dark luxury" (đen + nhũ đồng), duyệt qua Artifact mockup trước khi áp vào code thật — chốt bỏ theme Sáng/Auto (khác dự định ban đầu trong CLAUDE.md, đã cập nhật lại)
- Khảo sát Sheet Ads thật (`khaoSatAds()`), phát hiện cột số lưu dạng text (phải ép kiểu) và campaign `"Tương tác -Genkii Hub"` khớp 2 pattern cùng lúc → quyết định ưu tiên Hub B2B
- Code lần lượt: Tab Genkii đầy đủ (Ads + CRM) → Tab Tài sản (WIP=1) → Tab Thương hiệu cá nhân (streak) → Tab Nghi thức (phanh tự động, miss-streak) — mỗi tab đều test trên trình duyệt thật trước khi commit
- Sửa UX: banner "Đáng chú ý" ban đầu hiện xuyên suốt mọi tab và lặp lại số liệu đã có sẵn → đổi thành chỉ hiện khi có cảnh báo thật/mốc thời gian thật, thêm nút ẩn
- Đổi thương hiệu "Command Center" → "HayLaThoi Center", rút gọn nhãn tab Nghi thức trên nav thành "Kỷ luật"; tự vẽ icon PWA bằng Python/Pillow vì máy không có ImageMagick/rsvg-convert
- Thiết lập quy trình đồng bộ đa máy (PC công ty ⇄ PC nhà), ghi vào CLAUDE.md; PC nhà đã clone + test thành công lần đầu trong phiên này

### 15/07/2026 (đêm) — Telegram bot nhắc lịch + nút Hỏi Claude — v1 hoàn thiện toàn bộ SPEC
- Xây `sendTelegram()` + 5 hàm nhắc theo lịch cố định (sáng/tối/T2/T6/CN) + `checkEventAlerts()` chạy mỗi giờ (CPC lệch nhóm, dự án trì trệ, CRM quá hạn, vi phạm SLA), chống spam bằng `alertOnce()` (PropertiesService, 1 tin/ngày/điều kiện); thêm `setupTriggers()` vào setup.gs để cài 6 trigger 1 lần
- Chốt ngưỡng `nguong_qua_han = 10` liên hệ quá hạn (CLAUDE.md chưa ghi số cụ thể, hỏi Thôi và chốt)
- Debug thực tế trên Apps Script: token/chat_id đúng nhưng Telegram vẫn báo "chat not found" — hoá ra do `UrlFetchApp` đóng gói `payload` dạng object theo cách Telegram không parse đúng; sửa `sendTelegram()` gửi qua query string (`?chat_id=...&text=...`) thay vì payload object → gửi tin thành công tới bot `HayLaThoiCommandBot`
- Xây nút "Hỏi Claude" (SPEC mục 6): 13 nút trên các khối có số liệu đáng phân tích ở 4 tab (bỏ qua khối chỉ là danh sách log thuần), copy prompt kèm số liệu hiện tại vào clipboard qua `askBtn()` + delegation handler, có fallback `document.execCommand('copy')` cho trình duyệt cũ
- Test bằng Playwright (cài cục bộ, không có sẵn chromium-cli trong môi trường): inject dữ liệu giả gọi thẳng các hàm `renderTabX`, xác nhận đủ số nút, prompt đúng nội dung, clipboard + hiệu ứng "đã copy" hoạt động, không lỗi console
- Với việc này xong, scope v1 theo SPEC.md coi như hoàn thiện toàn bộ, chỉ còn ROAS thô tháng chờ Thôi nhập dữ liệu
