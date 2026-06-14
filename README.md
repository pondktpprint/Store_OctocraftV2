# Octo Craft SMP - Webshop Frontend

โปรเจกต์นี้เป็นหน้าเว็บไซต์ (Frontend) สำหรับระบบร้านค้าและระบบหลังบ้านของเซิร์ฟเวอร์ Minecraft `Octo Craft SMP` 
พัฒนาด้วย **HTML, CSS (Vanilla) และ JavaScript** เพื่อให้สามารถนำไปต่อยอดเชื่อมต่อกับ Backend หรือ API ได้ง่าย

## 📁 โครงสร้างไฟล์ (File Structure)

- `index.html` - หน้าแรกของเว็บไซต์ แสดงโปรโมชัน, จำนวนผู้เล่น, และอันดับการโดเนท (Top Donators)
- `shop.html` - หน้าร้านค้าสำหรับเลือกซื้อยศและไอเทม พร้อมระบบตะกร้าสินค้า (Shopping Cart)
- `topup.html` - หน้าเติมเงิน รองรับ PromptPay และ TrueMoney Wallet พร้อมจำลองระบบสแกน QR
- `contact.html` - หน้าติดต่อทีมงาน และระบบเปิดตั๋ว (Ticket System)
- `admin.html` - **ระบบหลังบ้าน (Admin Dashboard)** สำหรับจัดการร้านค้า, โค้ด, สมาชิก และการตั้งค่าเซิร์ฟเวอร์
- `style.css` - ไฟล์สไตล์หลักของเว็บไซต์ (ธีม Deep Sea / Glassmorphism)
- `admin.css` - ไฟล์สไตล์สำหรับระบบหลังบ้าน (ธีม Clean UI)

## 🚀 การนำไปใช้งาน (Deployment & Integration)

หน้าเว็บทั้งหมดนี้เป็นแบบ **Static Web Template** ที่สมบูรณ์แล้วในด้านของ UI (หน้าตา) และ UX (การใช้งานเบื้องต้น) 
การจะนำไปใช้งานจริง (Production) จะต้องมีการนำไปเชื่อมต่อระบบ Backend ต่อไปนี้:

1. **ระบบ Login:** ปัจจุบันมีการจำลองหน้าตาโปรไฟล์ไว้มุมขวาบน (ปุ่ม User) เมื่อใช้งานจริงต้องเขียน API เพื่อดึงข้อมูลชื่อและสกินผู้เล่นจากระบบ
2. **ระบบดึงข้อมูล 3D Skin:** ปัจจุบันใช้ API ฟรีจาก `minotar.net` และไลบรารี `skinview3d` ซึ่งสามารถใช้งานได้ทันที 
3. **ระบบร้านค้าและตะกร้า (Shop):** ในไฟล์ `shop.html` จะมีตัวแปร `cart` ใน JavaScript ให้ผู้พัฒนานำไปดัดแปลงตอนกดยืนยันการซื้อ เพื่อส่งข้อมูลไปตัดพอยท์ผ่าน API 
4. **ระบบตรวจสอบสลิป (Easyslip):** ในส่วนของหน้า `topup.html` และ `admin.html` เตรียมฟอร์มรับค่าไว้ให้แล้ว สามารถนำคีย์ Easyslip ไปเชื่อมต่อได้เลย
5. **โลโก้เซิร์ฟเวอร์:** อย่าลืมนำรูปภาพโลโก้เซิร์ฟเวอร์ตั้งชื่อว่า `logo.png` มาวางไว้ในโฟลเดอร์เดียวกับ `index.html` เพื่อให้โลโก้แสดงผล

## 🎨 ไลบรารีที่ใช้งาน (Dependencies)
- **Fonts:** Google Fonts (Outfit, Prompt)
- **Icons:** FontAwesome 6
- **3D Render:** [skinview3d](https://github.com/bs-community/skinview3d)

---
*Developed for Octo Craft SMP*
