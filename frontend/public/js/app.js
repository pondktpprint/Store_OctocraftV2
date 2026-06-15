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
        if (this.state.token && !this.state.user) {
            this.fetchProfile();
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
            } else {
                this.logout();
            }
        } catch (e) {
            console.error(e);
        }
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
            let profileHtml = `
                <div class="user-profile-btn" id="user-profile-btn">
                    <img src="https://minotar.net/helm/${this.escapeHTML(this.state.user.username)}/32.png" alt="${this.escapeHTML(this.state.user.username)}" class="user-avatar" onerror="this.src='/images/logo.png'">
                    <div class="user-details">
                        <span class="user-name">${this.escapeHTML(this.state.user.username)}</span>
                        <span class="user-points" id="nav-points"><i class="fas fa-coins"></i> Wallet</span>
                    </div>
                    <i class="fas fa-chevron-down dropdown-icon"></i>
                </div>
                
                <div class="profile-dropdown" id="profile-dropdown">
                    <a href="wallet.html" class="dropdown-item"><i class="fas fa-wallet"></i> กระเป๋าเงิน (Wallet)</a>
                    <a href="history.html" class="dropdown-item"><i class="fas fa-history"></i> ประวัติการสั่งซื้อ</a>
                    <div class="dropdown-divider"></div>
                    <a href="#" class="dropdown-item logout-item"><i class="fas fa-sign-out-alt"></i> ออกจากระบบ</a>
                </div>
            `;
            profileMenu.innerHTML = profileHtml;
        } else {
            profileMenu.innerHTML = `<button class="login-btn" onclick="window.location.href='index.html'"><i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ</button>`;
        }
    },

    logout() {
        localStorage.removeItem('octo_token');
        localStorage.removeItem('octo_user');
        localStorage.removeItem('octo_cart');
        this.state.token = null;
        this.state.user = null;
        this.state.cart = [];
        window.location.href = 'index.html';
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
            window.location.href = 'index.html';
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
