const App = {
    state: {
        token: localStorage.getItem('octo_token'),
        user: JSON.parse(localStorage.getItem('octo_user') || 'null'),
        cart: JSON.parse(localStorage.getItem('octo_cart') || '[]')
    },

    init() {
        this.bindEvents();
        this.renderSession();
        this.updateCartUI();
        if (this.state.token) {
            if (!this.state.user) this.fetchProfile();
            this.updateNavPoints();
        }
        this.renderIcons();
    },

    renderIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    },

    escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    translateError(errCode) {
        if (!errCode) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
        const errors = {
            'insufficient_points': 'พอยท์ไม่เพียงพอ',
            'insufficient_funds': 'ยอดเงินไม่เพียงพอ',
            'product_not_found': 'ไม่พบสินค้านี้ในระบบ',
            'product_inactive': 'สินค้านี้ถูกปิดการขายชั่วคราว',
            'invalid_credentials': 'ชื่อตัวละครหรือรหัสผ่านไม่ถูกต้อง',
            'too_many_requests': 'ทำรายการถี่เกินไป กรุณารอสักครู่',
            'too_many_attempts': 'เข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณารอสักครู่แล้วลองใหม่',
            'auth_required': 'กรุณาเข้าสู่ระบบก่อนทำรายการ',
            'admin_required': 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้',
            'slip_verification_failed': 'สลิปไม่ถูกต้อง หรือถูกใช้งานไปแล้ว',
            'slip_amount_mismatch': 'ยอดเงินในสลิปไม่ตรงกับยอดที่เลือก กรุณาตรวจสอบแล้วลองใหม่',
            'slip_receiver_mismatch': 'บัญชีผู้รับในสลิปไม่ตรงกับบัญชีรับเงินของเซิร์ฟเวอร์',
            'missing_required_fields': 'กรุณากรอกข้อมูลให้ครบถ้วน',
            'missing_fields': 'กรุณากรอกข้อมูลให้ครบถ้วน',
            'invalid_amount': 'จำนวนเงินไม่ถูกต้อง',
            'invalid_points': 'จำนวนพอยท์ไม่ถูกต้อง',
            'invalid_wallet_amount': 'จำนวนพอยท์สำหรับปรับยอดไม่ถูกต้อง',
            'invalid_wallet_transaction_type': 'ประเภทรายการพอยท์ไม่ถูกต้อง',
            'insufficient_wallet_balance': 'ยอดพอยท์คงเหลือไม่เพียงพอ',
            'wallet_balance_too_large': 'ยอดพอยท์สูงเกินขีดจำกัดของระบบ',
            'invalid_username': 'ชื่อผู้เล่นไม่ถูกต้อง',
            'player_not_found': 'ไม่พบชื่อผู้เล่นนี้ในระบบเกม',
            'user_not_found': 'ไม่พบชื่อผู้ใช้นี้ในระบบ',
            'invalid_transaction_reference': 'เลขอ้างอิงธุรกรรมไม่ถูกต้อง',
            'transaction_reference_already_used': 'เลขอ้างอิงธุรกรรมนี้ถูกใช้บันทึกเติมเงินแล้ว',
            'transaction_reference_mismatch': 'เลขอ้างอิงไม่ตรงกับข้อมูลเดิมของรายการนี้',
            'pending_topup_exists': 'พบรายการเติมเงินจำนวนเดียวกันที่รอตรวจสอบอยู่ กรุณาอนุมัติหรือปฏิเสธรายการเดิมก่อน',
            'manual_topup_inconsistent': 'ข้อมูลรายการเติมเงินกับสมุดพอยท์ไม่ตรงกัน กรุณาหยุดทำรายการและติดต่อผู้ดูแลระบบหรือทีมซัพพอร์ตทันที',
            'invalid_manual_topup_reason': 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร',
            'invalid_point_rate': 'อัตราแลกพอยท์ของระบบไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า',
            'request_not_found': 'ไม่พบรายการเติมเงินนี้',
            'not_pending': 'รายการเติมเงินนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ',
            'cannot_reject': 'ไม่สามารถปฏิเสธรายการเติมเงินนี้ได้',
            'duplicate_slip': 'สลิปนี้ถูกใช้เติมเงินไปแล้ว',
            'easyslip_error': 'เชื่อมต่อระบบตรวจสอบสลิปไม่ได้ กรุณาเก็บสลิปไว้และติดต่อทีมงาน',
            'nlogin_db_unreachable': 'ไม่สามารถเชื่อมต่อฐานข้อมูลผู้เล่นได้',
            'invalid_image_format': 'รูปสลิปมีรูปแบบข้อมูลไม่ถูกต้อง',
            'unsupported_image_type': 'ไฟล์รูปภาพไม่รองรับ (รับเฉพาะ PNG, JPG, WEBP)',
            'file_too_large': 'ไฟล์ขนาดใหญ่เกินไป (สูงสุด 4MB)',
            'invalid_payload': 'ข้อมูลที่ส่งมาไม่ถูกต้อง',
            'out_of_stock': 'สินค้าหมด'
        };
        return errors[errCode] || errCode;
    },

    bindEvents() {
        document.body.addEventListener('click', (e) => {
            // Profile dropdown
            const profileBtn = e.target.closest('#user-profile-btn');
            if (profileBtn) {
                document.getElementById('profile-dropdown')?.classList.toggle('active');
                profileBtn.querySelector('.dropdown-icon')?.classList.toggle('active');
            } else {
                document.getElementById('profile-dropdown')?.classList.remove('active');
                document.querySelector('.dropdown-icon')?.classList.remove('active');
            }

            // Logout
            if (e.target.closest('.logout-item')) {
                e.preventDefault();
                this.logout();
            }

            // Cart toggle
            if (e.target.closest('#cart-open-btn')) {
                document.getElementById('cart-sidebar')?.classList.add('active');
                document.getElementById('cart-overlay')?.classList.add('active');
            }

            // Close cart
            if (e.target.closest('#close-cart-btn') || e.target.closest('#cart-overlay')) {
                document.getElementById('cart-sidebar')?.classList.remove('active');
                document.getElementById('cart-overlay')?.classList.remove('active');
            }

            // Close modals
            if (e.target.closest('.close-modal')) {
                e.target.closest('.modal-overlay')?.classList.remove('active');
            }

            // Checkout
            if (e.target.closest('.checkout-btn')) {
                this.checkout();
            }
        });

        // Global modal closing
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                e.target.classList.remove('active');
            }
        });
    },

    async fetchProfile() {
        try {
            const res = await this.api('/api/auth/me');
            if (res.ok) {
                this.state.user = res.user;
                localStorage.setItem('octo_user', JSON.stringify(res.user));
                this.renderSession();
                this.updateNavPoints();
            } else {
                this.logout();
            }
        } catch (e) {
            console.error(e);
        }
    },

    async updateNavPoints() {
        try {
            const res = await this.api('/api/wallet');
            if (res.ok && document.getElementById('dropdown-points')) {
                document.getElementById('dropdown-points').innerText = res.wallet.balance_points.toLocaleString();
            }
        } catch(e) {}
    },

    async api(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (this.state.token) {
            headers['Authorization'] = `Bearer ${this.state.token}`;
        }
        const res = await fetch(path, { ...options, headers });
        return await res.json();
    },

    renderSession() {
        const profileMenu = document.querySelector('.user-profile-menu');
        if (!profileMenu) return;

        if (this.state.token && this.state.user) {
            const isAdmin = this.state.user.role === 'admin';
            let profileHtml = `
                <div class="user-profile-btn" id="user-profile-btn">
                    <img src="https://minotar.net/helm/${this.escapeHTML(this.state.user.username)}/32.png" alt="${this.escapeHTML(this.state.user.username)}" class="user-avatar" onerror="this.src='/images/logo.png'">
                    <div class="user-details">
                        <span class="user-name">${this.escapeHTML(this.state.user.username)}</span>
                    </div>
                    <i data-lucide="chevron-down" class="dropdown-icon"></i>
                </div>
                
                <div class="profile-dropdown" id="profile-dropdown">
                    ${isAdmin ? `
                    <a href="admin.html" class="dropdown-item" style="color: #00d2ff;"><i data-lucide="shield-check" style="color: #00d2ff;"></i> ระบบหลังบ้าน (Admin)</a>
                    <div class="dropdown-divider"></div>
                    ` : ''}
                    <div class="dropdown-item" style="cursor: default; color: #f59e0b; font-weight: bold;">
                        <i data-lucide="coins"></i> Point: <span id="dropdown-points">...</span>
                    </div>
                    <a href="#" class="dropdown-item" onclick="App.openTopupHistoryModal(); return false;"><i data-lucide="wallet"></i> ประวัติการเติมเงิน</a>
                    <a href="#" class="dropdown-item" onclick="App.openPurchaseHistoryModal(); return false;"><i data-lucide="history"></i> ประวัติการสั่งซื้อ</a>
                    <div class="dropdown-divider"></div>
                    <a href="#" class="dropdown-item logout-item" style="color: #ef4444;"><i data-lucide="log-out"></i> ออกจากระบบ</a>
                </div>
            `;
            profileMenu.innerHTML = profileHtml;
        } else {
            profileMenu.innerHTML = `<button class="login-btn" onclick="window.location.href='index.html?login=true'"><i data-lucide="log-in"></i> เข้าสู่ระบบ</button>`;
        }
        this.renderIcons();
    },

    logout() {
        localStorage.removeItem('octo_token');
        localStorage.removeItem('octo_user');
        localStorage.removeItem('octo_cart');
        localStorage.removeItem('octo_pending_topup_status');
        this.state.token = null;
        this.state.user = null;
        this.state.cart = [];
        window.location.href = 'index.html?login=true';
    },

    addToCart(product, qty) {
        qty = parseInt(qty);
        if (isNaN(qty) || qty < 1) return;
        
        const existing = this.state.cart.find(i => i.product_id === product.id);
        if (existing) {
            existing.quantity += qty;
        } else {
            this.state.cart.push({
                product_id: product.id,
                name: product.name,
                price: product.price_points,
                image: 'https://cdn-icons-png.flaticon.com/512/2838/2838575.png',
                quantity: qty
            });
        }
        
        localStorage.setItem('octo_cart', JSON.stringify(this.state.cart));
        this.updateCartUI();
        this.showToast('เพิ่มลงตะกร้าแล้ว!');
    },

    removeFromCart(productId) {
        this.state.cart = this.state.cart.filter(i => i.product_id !== productId);
        localStorage.setItem('octo_cart', JSON.stringify(this.state.cart));
        this.updateCartUI();
    },

    updateCartUI() {
        const badge = document.getElementById('cart-badge');
        const container = document.getElementById('cart-items-container');
        const totalEl = document.getElementById('cart-total-price');
        
        if (!badge || !container || !totalEl) return;

        let totalQty = 0;
        let totalPrice = 0;
        
        if (this.state.cart.length === 0) {
            container.innerHTML = '<div class="empty-cart-msg">ยังไม่มีสินค้าในตะกร้า</div>';
            badge.innerText = '0';
            badge.style.display = 'none';
            totalEl.innerText = '0 Points';
            return;
        }
        
        badge.style.display = 'flex';
        container.innerHTML = '';
        this.state.cart.forEach(item => {
            totalQty += item.quantity;
            totalPrice += (item.price * item.quantity);
            
            const div = document.createElement('div');
            div.classList.add('cart-item');
            div.innerHTML = `
                <img src="${this.escapeHTML(item.image)}" alt="${this.escapeHTML(item.name)}">
                <div class="cart-item-info">
                    <h4>${this.escapeHTML(item.name)}</h4>
                    <div class="cart-item-price">${this.escapeHTML(item.price)} Points x ${this.escapeHTML(item.quantity)}</div>
                </div>
                <button class="remove-item-btn" onclick="App.removeFromCart(${item.product_id})"><i data-lucide="trash-2"></i></button>
            `;
            container.appendChild(div);
        });
        
        badge.innerText = totalQty;
        totalEl.innerText = totalPrice.toLocaleString() + ' Points';
        this.renderIcons();
    },

    async checkout() {
        if (this.state.cart.length === 0) {
            this.showToast('ไม่มีสินค้าในตะกร้า');
            return;
        }
                if (!App.state.user) {
                Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'กรุณาเข้าสู่ระบบก่อนชำระเงิน', background: '#1a1f2b', color: '#fff' });
                document.getElementById('login-modal').classList.add('active');
                return;
            }

        const btn = document.querySelector('.checkout-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-circle" class="icon-spin"></i> กำลังชำระเงิน...';
        this.renderIcons();

        try {
            const items = this.state.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
            const res = await this.api('/api/orders', {
                method: 'POST',
                body: JSON.stringify({ items })
            });

                if (res.ok) {
                    Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'ชำระเงินสำเร็จ! คำสั่งซื้อของคุณกำลังถูกดำเนินการ', background: '#1a1f2b', color: '#fff' }).then(() => {
                        window.location.href = '/index.html';
                    });
                } else {
                    if (res.error === 'insufficient_points') {
                        Swal.fire({
                            icon: 'error',
                            title: 'พอยท์ไม่เพียงพอ',
                            text: 'กรุณาเติมเงินเพื่อซื้อสินค้านี้',
                            confirmButtonText: 'ไปหน้าเติมเงิน',
                            showCancelButton: true,
                            cancelButtonText: 'ยกเลิก',
                            background: '#1a1f2b', color: '#fff'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                window.location.href = '/topup.html';
                            }
                        });
                    } else {
                        Swal.fire({ icon: 'error', title: 'ล้มเหลว', text: 'ล้มเหลว: ' + this.translateError(res.error), background: '#1a1f2b', color: '#fff' });
                    }
                }
            } catch (err) {
                console.error(err);
                Swal.fire({ icon: 'error', title: 'ล้มเหลว', text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', background: '#1a1f2b', color: '#fff' });
            } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    openTopupHistoryModal() {
        let modal = document.getElementById('topup-history-modal');
        if (!modal) {
            const div = document.createElement('div');
            div.id = 'topup-history-modal';
            div.className = 'modal-overlay';
            div.innerHTML = `
                <div class="modal-content" style="max-width: 500px; padding: 25px; border-radius: 16px; background: rgba(10, 15, 30, 0.95); border: 1px solid rgba(138, 43, 226, 0.4); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 15px 50px rgba(0, 0, 0, 0.5);">
                    <button class="close-modal" onclick="document.getElementById('topup-history-modal').classList.remove('active')">&times;</button>
                    <h3 style="margin:0 0 15px 0; font-size:1.35rem; color:#ffffff; display:flex; align-items:center; gap:8px;"><i data-lucide="wallet" style="color:#00d2ff;"></i> ประวัติการเติมเงิน</h3>
                    <div style="max-height: 300px; overflow-y: auto; padding-right:5px; margin-bottom:15px;">
                        <ul id="topup-popup-tx-list" style="list-style: none; padding: 0; margin: 0;">
                            <li style="text-align:center; color: var(--text-muted); padding: 15px; font-size:0.9rem;">กำลังโหลด...</li>
                        </ul>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
            modal = div;
            this.renderIcons();
        }

        modal.classList.add('active');
        this.fetchTopupHistory();
    },

    async fetchTopupHistory() {
        try {
            const listEl = document.getElementById('topup-popup-tx-list');
            if (!listEl) return;

            const res = await this.api('/api/wallet');
            if (res.ok) {
                listEl.innerHTML = '';
                const topups = res.transactions.filter(tx => tx.type === 'credit');
                if (topups.length === 0) {
                    listEl.innerHTML = '<li style="text-align:center; padding: 15px; color: var(--text-muted); font-size:0.9rem;">ไม่มีประวัติการเติมเงิน</li>';
                } else {
                    topups.forEach(tx => {
                        const li = document.createElement('li');
                        li.style.padding = '10px 0';
                        li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                        li.style.display = 'flex';
                        li.style.justifyContent = 'space-between';
                        li.style.alignItems = 'center';
                        
                        const d = new Date(tx.created_at).toLocaleDateString('th-TH') + ' ' + new Date(tx.created_at).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});
                        
                        li.innerHTML = `
                            <div>
                                <div style="font-weight: 600; font-size: 0.9rem; color: #ffffff;">เติมเงินเข้าสู่ระบบ</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">${d}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 1rem; font-weight: bold; color: #00ff88;">+${tx.amount_points} Points</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">ยอดคงเหลือ: ${tx.balance_after}</div>
                            </div>
                        `;
                        listEl.appendChild(li);
                    });
                }
            } else {
                listEl.innerHTML = '<li style="text-align:center; color: #ff4d4d; padding: 15px; font-size:0.9rem;">ไม่สามารถโหลดประวัติได้</li>';
            }
        } catch(e) {
            const listEl = document.getElementById('topup-popup-tx-list');
            if (listEl) listEl.innerHTML = '<li style="text-align:center; color: #ff4d4d; padding: 15px; font-size:0.9rem;">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</li>';
        }
    },

    openPurchaseHistoryModal() {
        let modal = document.getElementById('purchase-history-modal');
        if (!modal) {
            const div = document.createElement('div');
            div.id = 'purchase-history-modal';
            div.className = 'modal-overlay';
            div.innerHTML = `
                <div class="modal-content" style="max-width: 500px; padding: 25px; border-radius: 16px; background: rgba(10, 15, 30, 0.95); border: 1px solid rgba(138, 43, 226, 0.4); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 15px 50px rgba(0, 0, 0, 0.5);">
                    <button class="close-modal" onclick="document.getElementById('purchase-history-modal').classList.remove('active')">&times;</button>
                    <h3 style="margin:0 0 15px 0; font-size:1.35rem; color:#ffffff; display:flex; align-items:center; gap:8px;"><i data-lucide="history" style="color:#00d2ff;"></i> ประวัติการสั่งซื้อ</h3>
                    <div style="max-height: 300px; overflow-y: auto; padding-right:5px; margin-bottom:15px;">
                        <ul id="purchase-popup-list" style="list-style: none; padding: 0; margin: 0;">
                            <li style="text-align:center; color: var(--text-muted); padding: 15px; font-size:0.9rem;">กำลังโหลด...</li>
                        </ul>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
            modal = div;
            this.renderIcons();
        }

        modal.classList.add('active');
        this.fetchPurchaseHistory();
    },

    async fetchPurchaseHistory() {
        try {
            const listEl = document.getElementById('purchase-popup-list');
            if (!listEl) return;

            const res = await this.api('/api/orders');
            if (res.ok) {
                listEl.innerHTML = '';
                if (res.orders.length === 0) {
                    listEl.innerHTML = '<li style="text-align:center; padding: 15px; color: var(--text-muted); font-size:0.9rem;">ไม่มีประวัติการสั่งซื้อ</li>';
                } else {
                    res.orders.forEach(order => {
                        const li = document.createElement('li');
                        li.style.padding = '10px 0';
                        li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                        li.style.display = 'flex';
                        li.style.justifyContent = 'space-between';
                        li.style.alignItems = 'center';
                        
                        const d = new Date(order.created_at).toLocaleDateString('th-TH') + ' ' + new Date(order.created_at).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});
                        
                        let statusHtml = '';
                        if (order.status === 'delivered') statusHtml = '<span style="color:#00ff88; font-size:0.8rem;">จัดส่งแล้ว</span>';
                        else if (order.status === 'pending_delivery') statusHtml = '<span style="color:#f59e0b; font-size:0.8rem;">กำลังดำเนินการ</span>';
                        else statusHtml = '<span style="color:#ff4d4d; font-size:0.8rem;">ล้มเหลว</span>';

                        li.innerHTML = `
                            <div>
                                <div style="font-weight: 600; font-size: 0.9rem; color: #ffffff;">Order #${order.id}</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">${d}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 1rem; font-weight: bold; color: #f59e0b;">${order.total_points} Points</div>
                                ${statusHtml}
                            </div>
                        `;
                        listEl.appendChild(li);
                    });
                }
            } else {
                listEl.innerHTML = '<li style="text-align:center; color: #ff4d4d; padding: 15px; font-size:0.9rem;">ไม่สามารถโหลดประวัติได้</li>';
            }
        } catch(e) {
            const listEl = document.getElementById('purchase-popup-list');
            if (listEl) listEl.innerHTML = '<li style="text-align:center; color: #ff4d4d; padding: 15px; font-size:0.9rem;">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</li>';
        }
    },

    showToast(message) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i data-lucide="circle-check"></i> <span>${this.escapeHTML(message)}</span>`;
        container.appendChild(toast);
        this.renderIcons();
        setTimeout(() => toast.remove(), 3000);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
