# ระบบบริหารจัดการงบประมาณ โรงเรียนสามัคคีศึกษา

เทคโนโลยีตามโจทย์:
- HTML5 / CSS3 / Vanilla JavaScript แบบ SPA
- Cloudflare Pages Functions (JavaScript)
- Google Sheets
- Chart.js
- Lucide Icons
- SweetAlert2
- Sarabun ผ่าน Fontsource
- GitHub + Cloudflare Pages

## ความสามารถรุ่น MVP
- Login และกำหนดสิทธิ์แบบหลายบทบาทต่อผู้ใช้ เช่น `admin`, `planner`, `teacher`, `procurement`, `finance`, `viewer`
- จัดการโครงการ: ปีงบประมาณ รหัส ชื่อ ผู้รับผิดชอบ งบประมาณ สถานะ
- จัดการกิจกรรมภายใต้โครงการ
- บันทึกรายจ่ายภายใต้โครงการ/กิจกรรม
- คำนวณเงินใช้ไปและเงินคงเหลืออัตโนมัติ
- Dashboard พร้อม Chart.js
- กรองตามปีงบประมาณ
- ป้องกันการลบโครงการ/กิจกรรมที่ยังมีข้อมูลลูก
- ลบข้อมูลได้เฉพาะ admin
- จัดการผู้ใช้งานสำหรับ admin: เพิ่ม แก้ไขบทบาทแบบเลือกได้หลายบทบาท เปิด/ปิดบัญชี และตั้งรหัสผ่านใหม่
- นำเข้าโครงการ/กิจกรรมจาก Excel ต้นแบบ พร้อมงบ 4 ประเภท: อุดหนุน, กิจกรรมฯ, รายได้ฯ, อื่นๆ
- ครูผู้รับผิดชอบโครงการส่งคำขอเบิกแบบหลายบิล เลือกกิจกรรม ช่วงดำเนินการ และประเภทเงินจากงบกิจกรรม
- Workflow ขอเบิก: รอพัสดุ → พัสดุดำเนินการ → รอการเงิน → จ่ายเงินแล้ว
- เมื่อการเงินลงจ่าย ระบบบันทึกรายจ่ายจริงให้โครงการ/กิจกรรมอัตโนมัติ
- พิมพ์บันทึกขอเบิกเงินรูปแบบ A4 จากข้อมูลคำขอ

## 1. เตรียม Google Sheet
สร้าง Google Sheet เปล่า 1 ไฟล์ แล้วคัดลอก `SHEET_ID` จาก URL

ระบบจะสร้างชีตเหล่านี้ให้อัตโนมัติ:
- Users
- Projects
- Activities
- Expenses

## 2. Google Service Account
1. สร้าง Google Cloud Project
2. เปิด Google Sheets API
3. สร้าง Service Account
4. สร้าง JSON Key
5. เอา `client_email` ใน JSON ไป Share Google Sheet เป็น Editor

**ห้ามอัปโหลด JSON Key ขึ้น GitHub**

## 3. GitHub
สร้าง repository ใหม่ แล้วอัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้

## 4. Cloudflare Pages
เชื่อม repository จาก GitHub

ค่า Build:
- Framework preset: `None`
- Build command: เว้นว่าง
- Build output directory: `/`

Environment Variables / Secrets:

- `SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON` = JSON service account ทั้งก้อน
- `JWT_SECRET` = สุ่มยาวอย่างน้อย 32 ตัว
- `PASSWORD_PEPPER` = สุ่มยาวอย่างน้อย 32 ตัว
- `SETUP_KEY` = คีย์สำหรับ setup ครั้งแรก
- `ADMIN_USERNAME` = เช่น `admin`
- `ADMIN_PASSWORD` = รหัสผ่านเริ่มต้น

## 5. Setup ครั้งแรก
หลัง deploy ให้เรียก:

```bash
curl -X POST https://YOUR-DOMAIN.pages.dev/api/setup \
  -H "Content-Type: application/json" \
  -d '{"setupKey":"YOUR_SETUP_KEY"}'
```

ระบบจะสร้างหัวตารางและบัญชี admin

จากนั้นเปิด:
`https://YOUR-DOMAIN.pages.dev`

## โครงสร้างข้อมูล

### Projects
`id, fiscalYear, code, name, owner, budget, status, createdAt, updatedAt`

### Activities
`id, projectId, code, name, budget, owner, status, createdAt, updatedAt`

### Expenses
`id, projectId, activityId, date, docNo, description, category, amount, payee, note, createdBy, createdAt, updatedAt`

### Users
`id, username, passwordHash, role, displayName, status, createdAt` — ช่อง `role` รองรับหลายบทบาทโดยเก็บเป็นค่าคั่นด้วย comma เพื่อให้ข้อมูลเดิมยังใช้งานได้

## ข้อเสนอสำหรับเฟสถัดไป
- หน้าจอจัดการผู้ใช้
- งบประมาณแยกตามหมวด/แหล่งเงิน
- เอกสารขออนุมัติ / PO / ใบเบิก
- แนบไฟล์หลักฐานเข้า Google Drive
- Audit Log
- รายงาน PDF / Excel
- แจ้งเตือนเมื่อใช้งบเกิน 80/90/100%
- Import โครงการและงบจาก Excel/Google Sheet


## ชีตเพิ่มเติมสำหรับระบบนำเข้าและขอเบิก
- `ProjectMeta` — ฝ่ายงาน/แหล่งที่มาของโครงการจากไฟล์นำเข้า
- `ActivityFunds` — งบกิจกรรมแยกตามประเภทเงิน
- `Requests` — หัวคำขอเบิกและสถานะการดำเนินงาน
- `RequestItems` — รายการบิลในแต่ละคำขอ
- `Settings` — ข้อมูลโรงเรียน/ผู้ลงนามที่ใช้ในแบบพิมพ์
