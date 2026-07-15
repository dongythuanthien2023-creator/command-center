# SPEC.md — Command Center v1.1 (bản chốt, đã gộp mọi điều chỉnh đến 14/07/2026)

> Nguồn gốc: Spec_v1.1_App_Command_Center_CHOT.docx + các quyết định bổ sung sau khi
> đối chiếu Code.gs v3.2 thật. File này là bản có hiệu lực cao nhất.

## 1. Mục tiêu & nguyên tắc
PWA cá nhân của Thôi: giám sát Quỹ A (Genkii), Quỹ B (tài sản), Quỹ C (thương hiệu cá nhân) + nghi thức kỷ luật. Chỉ đọc dữ liệu vận hành; một Sheet mới duy nhất cho dữ liệu cá nhân. Scope v1 đóng băng: 4 tab, 2 tuần, ý tưởng mới vào BACKLOG.md.

## 2. Kiến trúc
GitHub Pages (index.html PWA) ⇄ Apps Script Web App (gắn Sheet Command Center) ⇄ 3 Sheets. JSONP GET / POST no-cors. Token trong CaiDat.

## 3. Nguồn dữ liệu (đã xác nhận bằng khảo sát thật)
- Sheet Ads (ID trong CLAUDE.md): 7 cột, dòng = ngày×campaign, ngày yyyy-mm-dd
- Sheet CRM: đọc trực tiếp + gọi endpoint có sẵn (getCostStats, getDashboardData, getLuotRange, getSourceRange)
- Nguồn lead sau migration: FB Ads - BES / FB Ads - Hub / FB Ads - Agency (+ TikTok, Referral, Zalo OA, Website, Sự kiện, Khách cũ, Khác). Data cũ = FB Ads - BES, không có "ngày cắt"
- Chi phí Ads trong CRM: tự đồng bộ 3h sáng từ Sheet Ads (syncAdsCostFromReport) — sales không nhập tay
- Khách cũ nhấn lại QC: tab "Thống kê lượt ngày" cột C (Click lại QC) + cột E (unique)

## 4. Màn hình

### 4.1 Tab A — Genkii (đo HÔM NAY)
**Tầng 1 — media (từ Sheet Ads, chạy ngày 1):**
| Chỉ số | Ghi chú |
|---|---|
| Chi phí/Impr/Clicks/CTR/CPC hôm nay + MA7 | cảnh báo theo MA7, không so hôm qua |
| CPM | chẩn đoán CPC tăng: CPM (đấu giá) vs CTR (content) |
| Benchmark theo NHÓM (Chuyển đổi BES/Tương tác/Retargeting/Hub B2B) | mỗi nhóm ngưỡng riêng |
| Nhịp ngân sách tháng | ngày thực chạy × 1tr; cảnh báo ngày >1.2tr |
| Cơ cấu chi theo nhóm phễu | % Awareness/Chuyển đổi/Retargeting/Hub |
| Creative decay | CTR từng campaign theo tuần chạy |
+ sparkline 7/30 ngày, bảng campaign hôm nay, khối tuần lũy kế vs tuần trước

**Tầng 2 — kinh doanh (Ads × CRM, chạy ngày 1 trừ ghi chú):**
| Chỉ số | Trạng thái |
|---|---|
| Cost per Lead tổng + theo dòng (BES/Hub/Agency) | ngày 1 — gọi getCostStats |
| Lượt khách cũ nhấn lại QC | ngày 1 — Thống kê lượt ngày |
| Tỷ lệ chuyển đổi giữa giai đoạn (snapshot) | ngày 1 — getDashboardData funnel |
| Thời gian lưu TB mỗi giai đoạn | ngày 1 — dẫn xuất Lịch sử liên hệ (có data từ tháng 5) |
| ROAS thô tháng | chờ kỷ luật nhập cột Giá Trị ở deal Chốt |
Gạch khỏi v1: hiệu suất theo sales. Chỉ số thiếu dữ liệu → nhãn "chờ dữ liệu", không suy diễn.

**Khối CRM:** lead mới hôm nay/tuần (so tuần trước), phễu ngang chạm-xem, quá hạn liên hệ, khối Hub B2B tách riêng, vi phạm SLA (totalViPham).

### 4.2 Tab B — Tài sản (đo TIẾN ĐỘ)
Trạng thái Active/Xếp hàng/Đóng băng/Hoàn thành; **WIP=1 enforce ở backend**; bước x/y; cảnh báo trì trệ >N ngày (mặc định 4, đỏ + vào tin bot); nút "+ Tiến độ" ghi 1 dòng <15 giây.
Khởi tạo: Command Center (Active), Compliance engine, Protocol YHCT BES, Knowledge base YHCT, Tracking 158 bài SEO (đều Xếp hàng).

### 4.3 Tab C — Thương hiệu cá nhân (đo NHỊP)
Đếm video tuần/mục tiêu (mặc định 3, trần 4), đánh dấu 1 chạm (kênh TikTok/FB1/FB2 + link tùy chọn); **streak** tuần đạt chuẩn hiển thị trung tâm; số liệu kênh nhập CN (follow ×3, group, câu hỏi inbound) + đường tăng trưởng.

### 4.4 Tab Nghi thức (đo KỶ LUẬT)
Form #tuanmoi (3 ưu tiên A/B/C + việc tồn tự hiện); form #dongtuan (4 số: video, lần cập nhật Quỹ B, việc miss, năng lượng 1–10); biểu đồ năng lượng; **phanh tự động**: ≤4 hai tuần liên tiếp → giảm tải (video→2, Quỹ B Đóng băng, banner đến khi ≥6); miss 2 nghi thức liên tiếp → banner đỏ "Hệ thống hỏng ở đâu?" bắt trả lời 1 dòng.

## 5. Nhắc — Telegram (lịch trong CLAUDE.md). PWA push không dùng làm xương sống.

## 6. Nối với Claude
Nút "Hỏi Claude" mỗi khối: copy sẵn prompt kèm số liệu hiện tại để dán vào Claude app. Không gọi API Claude trong v1.

## 7. Schema Sheet Command Center
- `DuAn_QuyB`: id, ten, mo_ta, trang_thai, buoc_hien_tai, tong_buoc, ngay_tao, cap_nhat_cuoi
- `NhatKy_QuyB`: timestamp, id_du_an, buoc, ghi_chu_mot_dong
- `VideoLog_QuyC`: timestamp, kenh, link, tuan_iso
- `KenhStats_QuyC`: ngay, tiktok_follow, fb1_follow, fb2_follow, group_thanhvien, cau_hoi_inbound
- `NghiThuc`: tuan_iso, loai, uu_tien_A, uu_tien_B, uu_tien_C, video_dat, quyB_capnhat, viec_miss, nang_luong, timestamp
- `CaiDat`: khoa, gia_tri — gồm: token_api (bảo vệ endpoint), telegram_bot_token, telegram_chat_id, ngan_sach_thang, chi_phi_ngay_full (1000000), nguong_ngay_don (1200000), so_ngay_tri_tre (4), muc_tieu_video_tuan (3), nguong_qua_han (10 — số liên hệ quá hạn cùng lúc để bot cảnh báo), ads_sheet_id, crm_sheet_id, crm_webapp_url

## 8. Lộ trình
- Ngày 1–2: repo + Sheet CC + khảo sát tab bằng code + vá còn lại
- Ngày 3–5: backend API + khung PWA 4 tab + deploy Pages + cài lên điện thoại
- Ngày 6–8: Tab A đầy đủ, Tab B (WIP=1), Tab C (streak)
- Ngày 9–10: Nghi thức + giảm tải + Telegram bot + triggers + test end-to-end
- Tuần kế: chạy thật 7 ngày, chỉ sửa lỗi hỏng, không thêm tính năng

## 9. Backlog v2 (khóa)
Meta API trực tiếp; tầng AI tự phân tích (API Claude); module tracking SEO trong app; push PWA; báo cáo PDF tuần; widget màn hình khóa.
