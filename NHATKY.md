# NHATKY.md — Nhật ký phiên làm việc

> File này tóm lược bối cảnh cuộc trò chuyện giữa Thôi và Claude qua từng phiên — để phiên làm việc mới (máy khác, hoặc ngày khác) đọc và nối tiếp mạch mà không cần giải thích lại từ đầu.
> Cách dùng: đầu phiên mới, nói với Claude "đọc NHATKY.md trước khi làm gì" (hoặc Claude tự đọc nếu được nhắc bối cảnh dự án). Cuối phiên, cập nhật lại mục **"Trạng thái mới nhất"** + thêm 1 mục vào **"Lịch sử phiên"**.
> Quyết định kỹ thuật *lâu dài* (không đổi theo phiên) nằm trong `CLAUDE.md`, không lặp lại ở đây.

---

## Trạng thái mới nhất (cập nhật 15/07/2026, tối)

**Đã xong — cả 4 tab v1 hoạt động đầy đủ, đã test qua trình duyệt:**
- **Tab Genkii:** Tầng 1 Ads (chi phí/CPM/CTR/CPC hôm qua, MA7, benchmark 4 nhóm, nhịp ngân sách tháng) + Tầng 2 CRM (khách mới, phễu giai đoạn, nguồn lead, hoạt động Sales, quá hạn/vi phạm SLA) — dữ liệu thật 100%
- **Tab Tài sản:** WIP=1 (backend từ chối set Active thứ 2), nút "+ Tiến độ", nhật ký gần đây, cảnh báo trì trệ >4 ngày
- **Tab Thương hiệu cá nhân:** đếm video/tuần, streak (tuần đã kết thúc liên tiếp đạt chuẩn), đánh dấu 1 chạm (TikTok/FB1/FB2), nhập số liệu kênh
- **Tab Nghi thức:** form #tuanmoi/#dongtuan, biểu đồ năng lượng, phanh tự động giảm tải (2 tuần ≤4 → video mục tiêu về 2 + Quỹ B Đóng băng), banner "Hệ thống hỏng ở đâu?" khi miss 2 mốc liên tiếp

**Hạ tầng:**
- Repo: `https://github.com/dongythuanthien2023-creator/command-center` (public, nhánh `main`)
- Backend: Apps Script gắn Sheet "Command Center" (2 file: `Code.gs`, `setup.gs`), deploy dạng Web App — **mỗi lần sửa Code.gs phải Triển khai → Phiên bản mới** thủ công, không tự động
- Frontend: GitHub Pages, PWA cài được lên điện thoại, Service Worker network-first (tự cập nhật khi mở lại app có mạng)
- Thương hiệu: "HayLaThoi Center", theme dark luxury (đen + nhũ đồng) 1 bản duy nhất, icon PWA tự vẽ (sao 4 cánh, dùng Python/Pillow vì máy không có ImageMagick)

**Chưa làm (theo SPEC, không phải lỗi):**
- Telegram bot nhắc lịch (08:00/19:00/T2/T6/CN + theo sự kiện) — CaiDat đã có ô `telegram_bot_token`/`telegram_chat_id` nhưng chưa điền/chưa code trigger
- Nút "Hỏi Claude" copy prompt mỗi khối (SPEC mục 6)
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
