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
        if (!errCode) return 'à¹€à¸à¸´à¸”à¸à¹à¸­à¸œà¸´à¸”à¸žà¸¥à¸²à¸”à¸—à¸µà¹à¹à¸¡à¹à¸—à¸£à¸²à¸šà¸ªà¸²à¹€à¸«à¸•à¸¸';
        const errors = {
            'insufficient_points': 'à¸žà¸­à¸¢à¸—à¹Œà¹à¸¡à¹à¹€à¸žà¸µà¸¢à¸‡à¸žà¸­',
            'insufficient_funds': 'à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™à¹à¸¡à¹à¹€à¸žà¸µà¸¢à¸‡à¸žà¸­',
            'product_not_found': 'à¹à¸¡à¹à¸žà¸šà¸ªà¸´à¸™à¸„à¹à¸²à¸™à¸µà¹‰à¹ƒà¸™à¸£à¸°à¸šà¸š',
            'product_inactive': 'à¸ªà¸´à¸™à¸„à¹à¸²à¸™à¸µà¹‰à¸–à¸¹à¸à¸›à¸´à¸”à¸à¸²à¸£à¸‚à¸²à¸¢à¸Šà¸±à¹à¸§à¸„à¸£à¸²à¸§',
            'invalid_credentials': 'à¸Šà¸·à¹à¸­à¸•à¸±à¸§à¸¥à¸°à¸„à¸£à¸«à¸£à¸·à¸­à¸£à¸«à¸±à¸ªà¸œà¹à¸²à¸™à¹à¸¡à¹à¸–à¸¹à¸à¸•à¹à¸­à¸‡',
            'too_many_requests': 'à¸—à¸³à¸£à¸²à¸¢à¸à¸²à¸£à¸–à¸µà¹à¹€à¸à¸´à¸™à¹à¸› à¸à¸£à¸¸à¸“à¸²à¸£à¸­à¸ªà¸±à¸à¸„à¸£à¸¹à¹',
            'auth_required': 'à¸à¸£à¸¸à¸“à¸²à¹€à¸à¹à¸²à¸ªà¸¹à¹à¸£à¸°à¸šà¸šà¸à¹à¸­à¸™à¸—à¸³à¸£à¸²à¸¢à¸à¸²à¸£',
            'admin_required': 'à¸„à¸¸à¸“à¹à¸¡à¹à¸¡à¸µà¸ªà¸´à¸—à¸˜à¸´à¹Œà¹€à¸à¹à¸²à¸–à¸¶à¸‡à¸ªà¹à¸§à¸™à¸™à¸µà¹‰',
            'slip_verification_failed': 'à¸ªà¸¥à¸´à¸›à¹à¸¡à¹à¸–à¸¹à¸à¸•à¹à¸­à¸‡ à¸«à¸£à¸·à¸­à¸–à¸¹à¸à¹ƒà¸Šà¹à¸‡à¸²à¸™à¹à¸›à¹à¸¥à¹à¸§',
            'missing_required_fields': 'à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸à¸à¹à¸­à¸¡à¸¹à¸¥à¹ƒà¸«à¹à¸„à¸£à¸šà¸–à¹à¸§à¸™',
            'invalid_amount': 'à¸ˆà¸³à¸™à¸§à¸™à¹€à¸‡à¸´à¸™à¹à¸¡à¹à¸–à¸¹à¸à¸•à¹à¸­à¸‡',
            'user_not_found': 'à¹à¸¡à¹à¸žà¸šà¸Šà¸·à¹à¸­à¸œà¸¹à¹à¹ƒà¸Šà¹à¸™à¸µà¹‰à¹ƒà¸™à¸£à¸°à¸šà¸š',
            'unsupported_image_type': 'à¹à¸Ÿà¸¥à¹Œà¸£à¸¹à¸›à¸ à¸²à¸žà¹à¸¡à¹à¸£à¸­à¸‡à¸£à¸±à¸š (à¸£à¸±à¸šà¹€à¸‰à¸žà¸²à¸° PNG, JPG, WEBP)',
            'file_too_large': 'à¹à¸Ÿà¸¥à¹Œà¸à¸™à¸²à¸”à¹ƒà¸«à¸à¹à¹€à¸à¸´à¸™à¹à¸› (à¸ªà¸¹à¸‡à¸ªà¸¸à¸” 10MB)',
            'invalid_payload': 'à¸à¹à¸­à¸¡à¸¹à¸¥à¸—à¸µà¹à¸ªà¹à¸‡à¸¡à¸²à¹à¸¡à¹à¸–à¸¹à¸à¸•à¹à¸­à¸‡',
            'out_of_stock': 'à¸ªà¸´à¸™à¸„à¹à¸²à¸«à¸¡à¸”'
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
                    <a href="admin.html" class="dropdown-item" style="color: #00d2ff;"><i data-lucide="shield-check" style="color: #00d2ff;"></i> à¸£à¸°à¸šà¸šà¸«à¸¥à¸±à¸‡à¸šà¹à¸²à¸™ (Admin)</a>
                    <div class="dropdown-divider"></div>
                    ` : ''}
                    <div class="dropdown-item" style="cursor: default; color: #f59e0b; font-weight: bold;">
                        <i data-lucide="coins"></i> Point: <span id="dropdown-points">...</span>
                    </div>
                    <a href="#" class="dropdown-item" onclick="App.openTopupHistoryModal(); return false;"><i data-lucide="wallet"></i> à¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸à¸²à¸£à¹€à¸•à¸´à¸¡à¹€à¸‡à¸´à¸™</a>
                    <a href="#" class="dropdown-item" onclick="App.openPurchaseHistoryModal(); return false;"><i data-lucide="history"></i> à¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸à¸²à¸£à¸ªà¸±à¹à¸‡à¸‹à¸·à¹à¸­</a>
                    <div class="dropdown-divider"></div>
                    <a href="#" class="dropdown-item logout-item" style="color: #ef4444;"><i data-lucide="log-out"></i> à¸­à¸­à¸à¸à¸²à¸à¸£à¸°à¸šà¸š</a>
                </div>
            `;
            profileMenu.innerHTML = profileHtml;
        } else {
            profileMenu.innerHTML = `<button class="login-btn" onclick="window.location.href='index.html?login=true'"><i data-lucide="log-in"></i> à¹€à¸à¹à¸²à¸ªà¸¹à¹à¸£à¸°à¸šà¸š</button>`;
        }
        this.renderIcons();
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
        this.showToast('à¹€à¸žà¸´à¹à¸¡à¸¥à¸‡à¸•à¸°à¸à¸£à¹à¸²à¹à¸¥à¹à¸§!');
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
            container.innerHTML = '<div class="empty-cart-msg">à¸¢à¸±à¸‡à¹à¸¡à¹à¸¡à¸µà¸ªà¸´à¸™à¸„à¹à¸²à¹ƒà¸™à¸•à¸°à¸à¸£à¹à¸²</div>';
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
            this.showToast('à¹à¸¡à¹à¸¡à¸µà¸ªà¸´à¸™à¸„à¹à¸²à¹ƒà¸™à¸•à¸°à¸à¸£à¹à¸²');
            return;
        }
                if (!App.state.user) {
                Swal.fire({ icon: 'warning', title: 'à¹à¸à¹à¸‡à¹€à¸•à¸·à¸­à¸™', text: 'à¸à¸£à¸¸à¸“à¸²à¹€à¸à¹à¸²à¸ªà¸¹à¹à¸£à¸°à¸šà¸šà¸à¹à¸­à¸™à¸Šà¸³à¸£à¸°à¹€à¸‡à¸´à¸™', background: '#1a1f2b', color: '#fff' });
                document.getElementById('login-modal').classList.add('active');
                return;
            }

        const btn = document.querySelector('.checkout-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-circle" class="icon-spin"></i> à¸à¸³à¸¥à¸±à¸‡à¸Šà¸³à¸£à¸°à¹€à¸‡à¸´à¸™...';
        this.renderIcons();

        try {
            const items = this.state.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
            const res = await this.api('/api/orders', {
                method: 'POST',
                body: JSON.stringify({ items })
            });

                if (res.ok) {
                    Swal.fire({ icon: 'success', title: 'à¸ªà¸³à¹€à¸£à¹‡à¸', text: 'ðŸŽ‰ à¸Šà¸³à¸£à¸°à¹€à¸‡à¸´à¸™à¸ªà¸³à¹€à¸£à¹‡à¸! à¸„à¸³à¸ªà¸±à¹à¸‡à¸‹à¸·à¹à¸­à¸à¸­à¸‡à¸„à¸¸à¸“à¸à¸³à¸¥à¸±à¸‡à¸–à¸¹à¸à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£', background: '#1a1f2b', color: '#fff' }).then(() => {
                        window.location.href = '/index.html';
                    });
                } else {
                    if (res.error === 'insufficient_points') {
                        Swal.fire({
                            icon: 'error',
                            title: 'à¸žà¸­à¸¢à¸—à¹Œà¹à¸¡à¹à¹€à¸žà¸µà¸¢à¸‡à¸žà¸­',
                            text: 'à¸à¸£à¸¸à¸“à¸²à¹€à¸•à¸´à¸¡à¹€à¸‡à¸´à¸™à¹€à¸žà¸·à¹à¸­à¸‹à¸·à¹à¸­à¸ªà¸´à¸™à¸„à¹à¸²à¸™à¸µà¹‰',
                            confirmButtonText: 'à¹à¸›à¸«à¸™à¹à¸²à¹€à¸•à¸´à¸¡à¹€à¸‡à¸´à¸™',
                            showCancelButton: true,
                            cancelButtonText: 'à¸¢à¸à¹€à¸¥à¸´à¸',
                            background: '#1a1f2b', color: '#fff'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                window.location.href = '/topup.html';
                            }
                        });
                    } else {
                        Swal.fire({ icon: 'error', title: 'à¸¥à¹à¸¡à¹€à¸«à¸¥à¸§', text: 'âŒ à¸¥à¹à¸¡à¹€à¸«à¸¥à¸§: ' + this.translateError(res.error), background: '#1a1f2b', color: '#fff' });
                    }
                }
            } catch (err) {
                console.error(err);
                Swal.fire({ icon: 'error', title: 'à¸¥à¹à¸¡à¹€à¸«à¸¥à¸§', text: 'à¹€à¸à¸·à¹à¸­à¸¡à¸•à¹à¸­à¹€à¸à¸´à¸£à¹Œà¸à¹€à¸§à¸­à¸£à¹Œà¹à¸¡à¹à¹à¸”à¹', background: '#1a1f2b', color: '#fff' });
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
                    <h3 style="margin:0 0 15px 0; font-size:1.35rem; color:#ffffff; display:flex; align-items:center; gap:8px;"><i data-lucide="wallet" style="color:#00d2ff;"></i> à¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸à¸²à¸£à¹€à¸•à¸´à¸¡à¹€à¸‡à¸´à¸™</h3>
                    <div style="max-height: 300px; overflow-y: auto; padding-right:5px; margin-bottom:15px;">
                        <ul id="topup-popup-tx-list" style="list-style: none; padding: 0; margin: 0;">
                            <li style="text-align:center; color: var(--text-muted); padding: 15px; font-size:0.9rem;">à¸à¸³à¸¥à¸±à¸‡à¹‚à¸«à¸¥à¸”...</li>
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
                    listEl.innerHTML = '<li style="text-align:center; padding: 15px; color: var(--text-muted); font-size:0.9rem;">à¹à¸¡à¹à¸¡à¸µà¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸à¸²à¸£à¹€à¸•à¸´à¸¡à¹€à¸‡à¸´à¸™</li>';
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
                                <div style="font-weight: 600; font-size: 0.9rem; color: #ffffff;">à¹€à¸•à¸´à¸¡à¹€à¸‡à¸´à¸™à¹€à¸à¹à¸²à¸ªà¸¹à¹à¸£à¸°à¸šà¸š</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">${d}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 1rem; font-weight: bold; color: #00ff88;">+${tx.amount_points} Points</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">à¸¢à¸­à¸”à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­: ${tx.balance_after}</div>
                            </div>
                        `;
                        listEl.appendChild(li);
                    });
                }
            } else {
                listEl.innerHTML = '<li style="text-align:center; color: #ff4d4d; padding: 15px; font-size:0.9rem;">à¹à¸¡à¹à¸ªà¸²à¸¡à¸²à¸£à¸–à¹‚à¸«à¸¥à¸”à¸›à¸£à¸°à¸§à¸±à¸•à¸´à¹à¸”à¹</li>';
            }
        } catch(e) {
            const listEl = document.getElementById('topup-popup-tx-list');
            if (listEl) listEl.innerHTML = '<li style="text-align:center; color: #ff4d4d; padding: 15px; font-size:0.9rem;">à¹€à¸à¸·à¹à¸­à¸¡à¸•à¹à¸­à¹€à¸à¸´à¸£à¹Œà¸à¹€à¸§à¸­à¸£à¹Œà¹à¸¡à¹à¹à¸”à¹</li>';
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
                    <h3 style="margin:0 0 15px 0; font-size:1.35rem; color:#ffffff; display:flex; align-items:center; gap:8px;"><i data-lucide="history" style="color:#00d2ff;"></i> à¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸à¸²à¸£à¸ªà¸±à¹à¸‡à¸‹à¸·à¹à¸­</h3>
                    <div style="max-height: 300px; overflow-y: auto; padding-right:5px; margin-bottom:15px;">
                        <ul id="purchase-popup-list" style="list-style: none; padding: 0; margin: 0;">
                            <li style="text-align:center; color: var(--text-muted); padding: 15px; font-size:0.9rem;">à¸à¸³à¸¥à¸±à¸‡à¹‚à¸«à¸¥à¸”...</li>
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
                    listEl.innerHTML = '<li style="text-align:center; padding: 15px; color: var(--text-muted); font-size:0.9rem;">à¹à¸¡à¹à¸¡à¸µà¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸à¸²à¸£à¸ªà¸±à¹à¸‡à¸‹à¸·à¹à¸­</li>';
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
                        if (order.status === 'delivered') statusHtml = '<span style="color:#00ff88; font-size:0.8rem;">à¸à¸±à¸”à¸ªà¹à¸‡à¹à¸¥à¹à¸§</span>';
                        else if (order.status === 'pending_delivery') statusHtml = '<span style="color:#f59e0b; font-size:0.8rem;">à¸à¸³à¸¥à¸±à¸‡à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£</span>';
                        else statusHtml = '<span style="color:#ff4d4d; font-size:0.8rem;">à¸¥à¹à¸¡à¹€à¸«à¸¥à¸§</span>';

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
                listEl.innerHTML = '<li style="text-align:center; color: #ff4d4d; padding: 15px; font-size:0.9rem;">à¹à¸¡à¹à¸ªà¸²à¸¡à¸²à¸£à¸–à¹‚à¸«à¸¥à¸”à¸›à¸£à¸°à¸§à¸±à¸•à¸´à¹à¸”à¹</li>';
            }
        } catch(e) {
            const listEl = document.getElementById('purchase-popup-list');
            if (listEl) listEl.innerHTML = '<li style="text-align:center; color: #ff4d4d; padding: 15px; font-size:0.9rem;">à¹€à¸à¸·à¹à¸­à¸¡à¸•à¹à¸­à¹€à¸à¸´à¸£à¹Œà¸à¹€à¸§à¸­à¸£à¹Œà¹à¸¡à¹à¹à¸”à¹</li>';
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
