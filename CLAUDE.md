# CLAUDE.md — Command Center (Genkii / Thôi)

## Dự án là gì
PWA cá nhân chạy trên điện thoại của Thôi (PM tại Genkii), gộp 3 luồng công việc:
- **Tab A — Genkii (đo HÔM NAY):** số liệu Ads + tổng quan CRM (chỉ đọc, KHÔNG nhập liệu khách)
- **Tab B — Tài sản (đo TIẾN ĐỘ):** dự án dài hạn, ràng buộc WIP = 1 cài trong code
- **Tab C — Thương hiệu cá nhân (đo NHỊP):** đếm video/tuần, streak
- **Tab Nghi thức (đo KỶ LUẬT):** form #tuanmoi (thứ Hai) + #dongtuan (thứ Sáu), chế độ giảm tải tự kích hoạt

Chi tiết đầy đủ trong `SPEC.md` — ĐỌC TRƯỚC KHI CODE BẤT CỨ GÌ.

## Kiến trúc (giống hệ CRM đã vận hành — KHÔNG đổi stack)
- Frontend: 1 file `index.html` (HTML/JS/CSS thuần) host trên GitHub Pages, PWA (manifest + service worker)
- Backend: Google Apps Script gắn vào Sheet "Command Center", deploy Web App
- Giao tiếp: **JSONP cho GET** (tránh CORS), **POST no-cors "bắn và quên"** — đúng pattern CRM
- Mọi request kèm token cá nhân trong query; Apps Script từ chối request thiếu token

## 3 nguồn dữ liệu (đều thuộc tài khoản Google của Thôi)
1. **Sheet báo cáo Ads** (hệ thống tự ghi ~2h sáng): ID `1mTLWk3qig3sdC9MhRRPO72Xj2oavyF_niuNonnCBvbk`
   - Tab đầu: cột `Ngày (yyyy-mm-dd) | Campaign | Chi phí | Impressions | Clicks | CTR | CPC`, dòng = ngày × campaign
2. **Sheet CRM** ("CRM - Tổng" + các tab phụ): ID `1okp3LAwCCLSM8mycfPWRMF-78aS4O7wkQtPakGLcsfM`
   - Tab `CRM - Tổng`: dữ liệu từ hàng 13; cột A..P = STT, Họ Tên, SĐT, Cơ Sở, Nguồn Lead, Sản Phẩm, Giai Đoạn, Ngày Vào, Lần LH, Nội Dung, Next Step, Deadline, Giá Trị, Ghi chú, Nhiệt độ, Sales
   - Tab `Lịch sử liên hệ`: 11 cột (Ngày giờ, SĐT, Họ Tên, Sales, Giai Đoạn, Nội Dung, Next Step, Deadline, Loại hành động, Sản Phẩm, Tính lượt). Dòng giờ 00:00 = backfill, không phải submit thật
   - Tab `Thống kê lượt ngày`, `Chi phí Ads`, `Nhiệm vụ Sales`, `Sự kiện Genkii`
3. **Sheet Command Center** (tạo mới): tabs `DuAn_QuyB`, `NhatKy_QuyB`, `VideoLog_QuyC`, `KenhStats_QuyC`, `NghiThuc`, `CaiDat`
   - ID: 1SMvxCXdPZcKrpMSTJpv4-OpoD2G8lUKTA70sdBMM9Mo

## Endpoint CRM CÓ SẴN — GỌI LẠI, KHÔNG VIẾT LẠI LOGIC
CRM Web App (URL trong CaiDat) đã có, gọi qua JSONP:
- `getDashboardData` — lượt hôm nay, chuỗi 14 ngày, phễu giai đoạn, nguồn lead, hoạt động Sales, quá hạn, vi phạm SLA
- `getCostStats?from&to` — giá/mess, giá/SĐT theo nguồn trả phí (PAID_SOURCES = FB Ads - BES/Hub/Agency), mess/SĐT theo từng nguồn
- `getLuotRange`, `getSourceRange` — chuỗi theo khoảng ngày (from/to dạng yyyy-mm-dd, tối đa 92 ngày)
Nguyên tắc: **một nguồn logic duy nhất** — chỉ số nào CRM đã tính thì gọi endpoint, không tự tính lại.

## Quy tắc xử lý dữ liệu Ads (đã chốt — không tự sáng tạo lại)
- Ngày = 0 / "Không có campaign" = ngày không chạy (thực tế): loại khỏi trung bình CPC/CTR/MA7, giữ trong nhịp ngân sách, KHÔNG cảnh báo
- Campaign mới: mốc = ngày xuất hiện đầu; benchmark/cảnh báo chỉ bật sau ≥5 ngày active
- Khử trùng lặp (ngày+campaign) khi parse; cảnh báo nếu 2 ngày liên tiếp giống hệt từng campaign
- Phân nhóm theo pattern tên: `Ads chuyển đổi*BES*`→Chuyển đổi BES; `Tương tác*`→Tương tác; `Retargeting*`→Retargeting; `*Genkii Hub*`→Hub B2B; không khớp→"Chưa phân loại" + bot hỏi 1 lần
- Cảnh báo dựa trên độ lệch so với **MA7 của nhóm**, không so hôm qua, không so trung bình chung
- CaiDat: `chi_phi_ngay_full = 1000000`; nhịp tháng = số ngày thực chạy × chi_phi_ngay_full; cảnh báo ngày đơn > 1.2tr (chỉnh được)

## Quyết định kỹ thuật đã chốt khi code (15/07/2026) — không tự đổi lại nếu chưa hỏi
- Phân nhóm campaign: kiểm tra campaign có chứa "Genkii Hub" TRƯỚC, rồi mới kiểm tra tiền tố "Tương tác"/"Ads chuyển đổi" — vì có campaign vừa khớp cả 2 pattern (vd "Tương tác -Genkii Hub")
- `computeAdsData` trả field `today` nhưng thực chất luôn là **ngày liền trước** (báo cáo Ads ghi ~2h sáng cho hôm qua) — UI ghi rõ "hôm qua", không phải "hôm nay" live
- Ngưỡng "đáng chú ý" khi CPC nhóm lệch MA7: ±20% — số tự chọn (SPEC gốc không quy định), chỉnh trong `buildInsight`/`computeAdsData` nếu thấy ồn hoặc im quá
- Mọi POST (WIP=1, ghi tiến độ Quỹ B, đánh dấu video Quỹ C, nghi thức) đều no-cors "bắn và quên" — client KHÔNG đọc được response; biết thành công/thất bại chỉ qua lần GET reload kế tiếp (~800ms sau khi bắn POST)
- Banner "Đáng chú ý" (mọi tab) chỉ hiện khi có cảnh báo thật hoặc mốc thời gian thật đáng nói — không lặp lại số liệu đã có sẵn trong card bên dưới; luôn có nút ẩn (×)
- Miss-streak (Tab Nghi thức) chỉ tính các mốc Thứ Hai/Thứ Sáu **sau** lần đầu tiên dùng tính năng (earliestEntryDate) — tránh báo miss oan cho các tuần trước khi NghiThuc có dữ liệu

## Trạng thái v1 (cập nhật 15/07/2026)
Cả 4 tab đã code xong đầy đủ chức năng theo SPEC, đã test qua trình duyệt. Còn thiếu (chưa code, không phải lỗi): Telegram bot nhắc lịch, nút "Hỏi Claude" copy prompt mỗi khối, icon PWA đã có (SVG sao 4 cánh tự vẽ bằng Pillow). Chi tiết phiên làm việc xem `NHATKY.md`.

## Thời gian lưu giai đoạn — dẫn xuất, KHÔNG cần log mới
Đọc `Lịch sử liên hệ`, nhóm theo SĐT (fallback Tên), sắp theo thời gian thật (parse "dd/mm/yyyy HH:MM"), phát hiện điểm cột Giai Đoạn đổi giá trị giữa 2 dòng liên tiếp = thời điểm chuyển giai đoạn. Dòng 00:00 (backfill) chỉ dùng làm mốc khởi đầu, không tính là chuyển.

## Quy tắc scope v1 — KHÓA CỨNG
- Đúng 4 tab như SPEC.md. Mọi ý tưởng mới → ghi vào `BACKLOG.md`, KHÔNG code
- WIP = 1 cho DuAn_QuyB: backend từ chối set Active khi đã có 1 dự án Active
- Chế độ giảm tải: năng lượng ≤4 hai tuần liên tiếp → mục tiêu video về 2, dự án Quỹ B tự Đóng băng, banner nghỉ đến khi ≥6

## Bảo mật & quy ước
- Telegram bot token + chat_id: CHỈ nằm trong tab CaiDat của Sheet. KHÔNG BAO GIỜ hardcode trong code, KHÔNG commit lên Git
- Repo GitHub Pages: public (bắt buộc với Pages gói free) → token bảo vệ API nằm trong CaiDat, URL Apps Script không đưa vào README
- UI + comment code: tiếng Việt. Phong cách "Dark luxury" — nền đen tuyền + nhũ vàng/đồng, 1 theme tối duy nhất (không Sáng/Auto, khác CRM v3.2), font hệ thống (ui-serif tiêu đề/số lớn, system-ui nội dung, ui-monospace số liệu). Chốt theo mockup đã duyệt 15/07/2026
- Ngày kiểu VN "dd/mm/yyyy": LUÔN parse thủ công, KHÔNG dùng `new Date(string)` trực tiếp (JS hiểu mm/dd)
- Git: commit message tiếng Việt ngắn gọn; push cuối mỗi phiên làm việc

## Quy trình đồng bộ đa máy (làm việc luân phiên PC nhà / laptop / máy khác)
Dự án không có bước build (HTML/JS/CSS thuần + Apps Script), nên đồng bộ = đồng bộ Git, không cần cài thêm gì.

**Đầu mỗi phiên làm việc** (bất kỳ máy nào, kể cả máy đang dùng thường xuyên):
```
git pull origin main
```
Luôn pull trước khi sửa gì, kể cả khi "chắc chắn máy này đang mới nhất" — tránh ghi đè thay đổi từ máy kia.

**Cuối mỗi phiên làm việc** (bắt buộc, đừng bỏ qua dù việc nhỏ):
```
git add -A
git commit -m "mô tả ngắn gọn tiếng Việt"
git push origin main
```
Nếu `git status` không có gì thay đổi thì bỏ qua bước này, không tạo commit rỗng.

**Thiết lập lần đầu trên máy mới** (ví dụ PC nhà, ổ cứng riêng chưa có repo):
```
git clone https://github.com/dongythuanthien2023-creator/command-center.git
```
Chỉ cần chạy 1 lần trên mỗi máy mới. Sau đó máy đó dùng lại đúng 2 lệnh pull/push ở trên như mọi máy khác.

Lưu ý: token trong `CaiDat` (Sheet) và token trong `CONFIG.token` của `index.html` đã nằm sẵn trong code/Sheet — không cần cấu hình gì thêm riêng theo máy. Thư mục `.claude/` (cấu hình cục bộ của Claude Code) không sync qua Git, mỗi máy tự có bản riêng — bình thường, không phải lỗi.

## Nhắc nhở — Telegram bot (trigger Apps Script)
- 08:00 hằng ngày: tóm tắt Ads hôm qua + cảnh báo + trạng thái dự án Quỹ B Active
- 19:00 hằng ngày: nhắc phiên content + "Quỹ B hôm nay tiến được gì?"
- Thứ Hai 08:30: nhắc #tuanmoi + số tuần trước | Thứ Sáu 20:00: nhắc #dongtuan | CN 20:00: nhắc số liệu kênh Quỹ C
- Theo sự kiện: CPC lệch nhóm, dự án Active trì trệ >N ngày (mặc định 4), CRM quá hạn vượt ngưỡng
