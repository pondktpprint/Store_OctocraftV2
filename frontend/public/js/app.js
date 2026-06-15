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
                    <i class="fas fa-chevron-down dropdown-icon"></i>
                </div>
                
                <div class="profile-dropdown" id="profile-dropdown">
                    ${isAdmin ? `
                    <a href="admin.html" class="dropdown-item" style="color: #00d2ff;"><i class="fas fa-user-shield" style="color: #00d2ff;"></i> ระบบหลังบ้าน (Admin)</a>
                    <div class="dropdown-divider"></div>
                    ` : ''}
                    <div class="dropdown-item" style="cursor: default; color: #f59e0b; font-weight: bold;">
                        <i class="fas fa-coins"></i> Point: <span id="dropdown-points">...</span>
                    </div>
                    <a href="#" class="dropdown-item" onclick="App.openTopupHistoryModal(); return false;"><i class="fas fa-wallet"></i> ประวัติการเติมเงิน</a>
                    <a href="#" class="dropdown-item" onclick="App.openPurchaseHistoryModal(); return false;"><i class="fas fa-history"></i> ประวัติการสั่งซื้อ</a>
                    <div class="dropdown-divider"></div>
                    <a href="#" class="dropdown-item logout-item" style="color: #ef4444;"><i class="fas fa-sign-out-alt"></i> ออกจากระบบ</a>
                </div>
            `;
            profileMenu.innerHTML = profileHtml;
        } else {
            profileMenu.innerHTML = `<button class="login-btn" onclick="window.location.href='index.html?login=true'"><i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ</button>`;
        }
    },

    logout() {
        localStorage.removeItem('octo_token');
        localStorage.removeItem('octo_user');
        localStorage.removeItem('octo_cart');
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
                <button class="remove-item-btn" onclick="App.removeFromCart(${item.product_id})"><i class="fas fa-trash"></i></button>
            `;
            container.appendChild(div);
        });
        
        badge.innerText = totalQty;
        totalEl.innerText = totalPrice.toLocaleString() + ' Points';
    },

    async checkout() {
        if (this.state.cart.length === 0) {
            this.showToast('ไม่มีสินค้าในตะกร้า');
            return;
        }
        
        if (!this.state.token) {
            alert('กรุณาเข้าสู่ระบบก่อนชำระเงิน');
            window.location.href = 'index.html?login=true';
            return;
        }

        const btn = document.querySelector('.checkout-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังชำระเงิน...';

        try {
            const items = this.state.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
            const res = await this.api('/api/orders', {
                method: 'POST',
                body: JSON.stringify({ items })
            });

            if (res.ok) {
                alert('🎉 ชำระเงินสำเร็จ! คำสั่งซื้อของคุณกำลังถูกดำเนินการ');
                this.state.cart = [];
                localStorage.removeItem('octo_cart');
                this.updateCartUI();
                document.getElementById('cart-sidebar')?.classList.remove('active');
                document.getElementById('cart-overlay')?.classList.remove('active');
            } else {
                alert('❌ ล้มเหลว: ' + res.error);
            }
        } catch (err) {
            alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
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
                    <h3 style="margin:0 0 15px 0; font-size:1.35rem; color:#ffffff; display:flex; align-items:center; gap:8px;"><i class="fas fa-wallet" style="color:#00d2ff;"></i> ประวัติการเติมเงิน</h3>
                    <div style="max-height: 300px; overflow-y: auto; padding-right:5px; margin-bottom:15px;">
                        <ul id="topup-popup-tx-list" style="list-style: none; padding: 0; margin: 0;">
                            <li style="text-align:center; color: var(--text-muted); padding: 15px; font-size:0.9rem;">กำลังโหลด...</li>
                        </ul>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
            modal = div;
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
                    <h3 style="margin:0 0 15px 0; font-size:1.35rem; color:#ffffff; display:flex; align-items:center; gap:8px;"><i class="fas fa-history" style="color:#00d2ff;"></i> ประวัติการสั่งซื้อ</h3>
                    <div style="max-height: 300px; overflow-y: auto; padding-right:5px; margin-bottom:15px;">
                        <ul id="purchase-popup-list" style="list-style: none; padding: 0; margin: 0;">
                            <li style="text-align:center; color: var(--text-muted); padding: 15px; font-size:0.9rem;">กำลังโหลด...</li>
                        </ul>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
            modal = div;
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
        toast.innerHTML = `<i class="fas fa-check-circle"></i> <span>${this.escapeHTML(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
